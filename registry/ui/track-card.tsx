"use client";

import * as React from "react";

import {
  Heart,
  ListCheck,
  ListMusic,
  ListPlus,
  Pause,
  Play,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TrackCardItem = {
  id: string;
  title: string;
  artist: string;
  /** Length in seconds. */
  duration: number;
};

export type TrackCardTrack = TrackCardItem & {
  /** A short line above the title: the release and its year. */
  release?: string;
};

export type TrackCardSize = "sm" | "md" | "lg";

export type TrackCardReveal = "hover" | "always";

export type TrackCardProps = {
  /** The track: its title is the card's heading. @default defaultTrack */
  track?: TrackCardTrack;
  /** Cover art drawn inside the sleeve, such as an `<img>`. @default procedural art seeded from the track */
  art?: React.ReactNode;
  /** The tracks already lined up after this one, listed in the Up next panel. @default defaultUpNext */
  upNext?: TrackCardItem[];
  /** Controlled playback state. */
  playing?: boolean;
  /** Initial playback state when uncontrolled. @default false */
  defaultPlaying?: boolean;
  /** Fires from the press that changed it, or when the track reaches its end. */
  onPlayingChange?: (playing: boolean) => void;
  /** Controlled playhead, in seconds. Uncontrolled, the playhead advances by itself while playing. */
  position?: number;
  /** Initial playhead when uncontrolled, in seconds. @default 0 */
  defaultPosition?: number;
  /** Fires on every seek (press, drag, arrow keys), on pause and at the end, in seconds. */
  onPositionChange?: (seconds: number) => void;
  /** Controlled heart. */
  liked?: boolean;
  /** Initial heart when uncontrolled. @default false */
  defaultLiked?: boolean;
  /** Fires from the press that changed it. */
  onLikedChange?: (liked: boolean) => void;
  /** Controlled: this track is lined up in Up next. */
  queued?: boolean;
  /** Initial queue state when uncontrolled. @default false */
  defaultQueued?: boolean;
  /** Fires from Queue, from a like that lines the track up, or from Remove. */
  onQueuedChange?: (queued: boolean) => void;
  /** Liking a track that is not lined up yet also adds it to Up next, thrown into the badge. @default true */
  likeQueues?: boolean;
  /** How many bars the waveform is drawn with: coarse blocks or a dense comb. @default 56 */
  bars?: number;
  /** How fast the record turns while playing, in rpm; 0 holds it still. @default 16 */
  spin?: number;
  /** How far the record slides out of its sleeve while playing, as a share of the record (0.1 to 0.7). @default 0.5 */
  peek?: number;
  /** When the waveform stands up: on hover, focus, play and scrub, or always. @default "hover" */
  reveal?: TrackCardReveal;
  /** Sleeve 64 / 72 / 80 px on a narrow card, 96 / 112 / 128 px on a wide one. @default "md" */
  size?: TrackCardSize;
  /** Colour of the played bars, the playhead and the cover art. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the ticks of a scrub and the landing in the queue. Off unless asked for. @default false */
  sound?: boolean;
  /** Nothing plays, seeks or queues. @default false */
  disabled?: boolean;
  className?: string;
};

export const defaultTrack: TrackCardTrack = {
  id: "low-tide-signal",
  title: "Low Tide Signal",
  artist: "Mara Venn",
  release: "Single · 2026",
  duration: 221,
};

export const defaultUpNext: TrackCardItem[] = [
  {
    id: "glass-harbour",
    title: "Glass Harbour",
    artist: "Odile North",
    duration: 198,
  },
  {
    id: "basin-lights",
    title: "Basin Lights",
    artist: "The Coldbrook Set",
    duration: 244,
  },
];

const SLEEVE: Record<TrackCardSize, { narrow: number; wide: number }> = {
  sm: { narrow: 64, wide: 96 },
  md: { narrow: 72, wide: 112 },
  lg: { narrow: 80, wide: 128 },
};

/** Where the record rests inside its sleeve, as a share of its own width. */
const REST = 0.06;
/** A bar's height at rest, in px: the track as a dotted baseline. */
const STUB = 4;
/** Height of the time readouts' row at the top of the lane, in px. */
const LABELS = 18;
/** The ripple reaches the far end of the lane this long after it starts. */
const SPREAD = 0.18;
/** The ripple's clock runs this long: the last bar's spring has settled. */
const RISE = 0.52;
/** How long a thrown track takes to reach the badge, in s. */
const FLIGHT = 0.42;
/** A sound answers the visitor only this soon after their press, in ms. */
const BEAT = 900;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** m:ss, from whole seconds. */
const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** FNV-1a: a stable 32-bit seed from text. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A small seeded generator, so the server and the browser draw the same song. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The loudness of a song over its length: an intro that builds, two verses
 * and choruses, a bridge that drops out, a last chorus and a fade.
 */
const ENVELOPE: readonly (readonly [number, number])[] = [
  [0, 0.28],
  [0.06, 0.52],
  [0.2, 0.58],
  [0.26, 0.95],
  [0.4, 0.9],
  [0.44, 0.56],
  [0.56, 0.62],
  [0.6, 1],
  [0.72, 0.94],
  [0.76, 0.42],
  [0.83, 0.5],
  [0.85, 1],
  [0.94, 0.88],
  [1, 0.22],
];

function envelope(u: number): number {
  for (let i = 1; i < ENVELOPE.length; i += 1) {
    const a = ENVELOPE[i - 1];
    const b = ENVELOPE[i];
    if (a && b && u <= b[0])
      return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0]));
  }
  return ENVELOPE[ENVELOPE.length - 1]?.[1] ?? 0.2;
}

/**
 * Bar heights, 0 to 1. The noise is sampled by position along the track, so
 * a different bar count redraws the same song, finer or coarser.
 */
function waveform(seedText: string, count: number): number[] {
  const rand = seeded(hash(seedText));
  const noise = Array.from({ length: 129 }, () => rand());
  return Array.from({ length: count }, (_, i) => {
    const u = (i + 0.5) / count;
    const p = u * 128;
    const k = Math.floor(p);
    const smooth = lerp(noise[k] ?? 0.5, noise[k + 1] ?? 0.5, p - k);
    const grain = noise[(i * 37 + 11) % 129] ?? 0.5;
    return r3(
      clamp(envelope(u) * (0.42 + 0.42 * smooth + 0.16 * grain), 0.08, 1),
    );
  });
}

/*
 * Each bar rises on its own springs.snap step response, evaluated from the
 * spring's stiffness and damping rather than simulated: one clock drives the
 * whole lane, so a ripple of 96 bars is still one path rebuilt per frame.
 */
const SNAP_W = Math.sqrt(springs.snap.stiffness / springs.snap.mass);
const SNAP_Z =
  springs.snap.damping /
  (2 * Math.sqrt(springs.snap.stiffness * springs.snap.mass));
const SNAP_WD = SNAP_W * Math.sqrt(1 - SNAP_Z * SNAP_Z);
const snapStep = (t: number) =>
  t <= 0
    ? 0
    : 1 -
      Math.exp(-SNAP_Z * SNAP_W * t) *
        (Math.cos(SNAP_WD * t) +
          ((SNAP_Z * SNAP_W) / SNAP_WD) * Math.sin(SNAP_WD * t));

type Lane = { w: number; h: number };

function barsPath(
  heights: readonly number[],
  lane: Lane,
  rise: (i: number) => number,
): string {
  const n = heights.length;
  if (n === 0) return "";
  const pitch = lane.w / n;
  // Under about 4 px a bar and its gap smear into grey at fractional
  // positions: the gap goes and the bars become one solid comb.
  const gap = pitch >= 4 ? Math.max(1, pitch * 0.32) : 0;
  const width = r2(pitch - gap);
  const top = Math.max(STUB, lane.h - LABELS);
  const floor = r2(lane.h);
  let d = "";
  for (let i = 0; i < n; i += 1) {
    const full = (heights[i] ?? 0) * top;
    const h = STUB + (full - STUB) * rise(i);
    d += `M${r2(i * pitch + gap / 2)} ${floor}V${r2(lane.h - Math.max(0, h))}h${width}V${floor}Z`;
  }
  return d;
}

/** A pigment from the accent: its hue turned, at a fixed lightness, so it reads the same in both themes. */
const pigment = (accent: string, l: number, c: string, turn: number) =>
  `oklch(from ${accent} ${l} ${c} calc(h + ${turn}))`;

const VINYL = "oklch(from var(--bg-0) 0.19 0.012 h)";
const GROOVE = "oklch(from var(--bg-0) 0.34 0.014 h / 0.55)";

function CoverArt({
  seed,
  accent,
  id,
}: {
  seed: string;
  accent: string;
  id: string;
}) {
  const rand = seeded(hash(`${seed}:art`));
  const turn = Math.round(rand() * 200 - 100);
  const sunX = Math.round(48 + rand() * 30);
  const sunY = Math.round(26 + rand() * 16);
  const waves = Array.from({ length: 5 }, (_, k) => {
    const y = 60 + k * 8;
    const amp = r2(1 + rand() * 2.4);
    const phase = rand() * 6;
    const pts: string[] = [];
    for (let x = 0; x <= 100; x += 10) {
      pts.push(`${x} ${r3(y + amp * Math.sin(x / 9 + phase))}`);
    }
    return { d: `M${pts.join(" L")}`, o: r2(0.6 - k * 0.08) };
  });
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0"
            style={{ stopColor: pigment(accent, 0.46, "c", turn) }}
          />
          <stop
            offset="1"
            style={{
              stopColor: pigment(accent, 0.24, "calc(c * 0.7)", turn - 30),
            }}
          />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      <circle
        cx={sunX}
        cy={sunY}
        r="15"
        style={{ fill: pigment(accent, 0.88, "calc(c * 0.55)", turn + 70) }}
      />
      <rect
        y="58"
        width="100"
        height="42"
        style={{ fill: pigment(accent, 0.3, "c", turn - 18) }}
      />
      {waves.map((w) => (
        <path
          key={w.d}
          d={w.d}
          fill="none"
          stroke="white"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity={w.o}
        />
      ))}
    </svg>
  );
}

/** The record. Its sheen is drawn by the caller, outside the turning part. */
function Vinyl({ seed, accent }: { seed: string; accent: string }) {
  const rand = seeded(hash(`${seed}:label`));
  const start = rand() * Math.PI * 2;
  const sweep = 1.1;
  const at = (r: number, a: number) =>
    `${r3(50 + r * Math.cos(a))} ${r3(50 + r * Math.sin(a))}`;
  const band = `M${at(15, start)} A15 15 0 0 1 ${at(15, start + sweep)} L${at(9, start + sweep)} A9 9 0 0 0 ${at(9, start)} Z`;
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="block size-full">
      <circle cx="50" cy="50" r="50" style={{ fill: VINYL }} />
      {[46, 42.5, 39, 35.5, 32, 28.5, 25].map((r) => (
        <circle
          key={r}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="0.5"
          style={{ stroke: GROOVE }}
        />
      ))}
      <circle
        cx="50"
        cy="50"
        r="18"
        style={{ fill: pigment(accent, 0.7, "c", 0) }}
      />
      <path d={band} fill="white" opacity="0.6" />
      <circle cx="50" cy="50" r="1.8" className="fill-card" />
    </svg>
  );
}

const coverWash = (accent: string, seed: string) => {
  const turn = Math.round(seeded(hash(`${seed}:art`))() * 200 - 100);
  return `linear-gradient(160deg, ${pigment(accent, 0.62, "c", turn + 40)}, ${pigment(accent, 0.3, "c", turn - 20)})`;
};

type Latest = {
  ended: () => void;
  land: () => void;
};

/**
 * A music track card. Its waveform is the card's bottom edge: a dotted
 * baseline at rest that stands up bar by bar when you hover, spreading from
 * where the pointer came in, each bar on its own snap spring. Moving along
 * the card scrubs a ghost playhead that lights the bars up to the pointer;
 * pressing or dragging the lane seeks. Play slides the record half out of its
 * sleeve on glide and spins it up like a turntable under a fixed sheen. Like
 * and Queue throw a copy of the cover into the Up next badge, which recoils
 * and rolls its count when it lands, and opens as a real disclosure.
 *
 * The lane is a `role="slider"` (arrows ±5 s, Page keys ±30 s, Home, End);
 * Play, Like and Queue are buttons; Escape closes the panel wherever focus is.
 * Under reduced motion the waveform cross-fades in, the record swaps out
 * without travelling or turning and nothing flies, while the playhead, the
 * lit bars and the count still change.
 */
export function TrackCard({
  track = defaultTrack,
  art,
  upNext = defaultUpNext,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  position,
  defaultPosition = 0,
  onPositionChange,
  liked,
  defaultLiked = false,
  onLikedChange,
  queued,
  defaultQueued = false,
  onQueuedChange,
  likeQueues = true,
  bars = 56,
  spin = 16,
  peek = 0.5,
  reveal = "hover",
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: TrackCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;
  const panelTitleId = `${uid}-panel-title`;
  const artId = `tc-art-${safeId}`;
  const playedClip = `tc-played-${safeId}`;
  const previewClip = `tc-preview-${safeId}`;

  const dur = Math.max(1, track.duration);
  const count = clamp(Math.round(bars), 8, 160);
  const out = clamp(peek, 0.1, 0.7);
  const rpm = clamp(spin, 0, 78);
  const sleeve = SLEEVE[size] ?? SLEEVE.md;
  const seed = `${track.id}:${track.title}:${track.artist}`;

  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const [ownLiked, setOwnLiked] = React.useState(defaultLiked);
  const [ownQueued, setOwnQueued] = React.useState(defaultQueued);
  const isPlaying = playing ?? ownPlaying;
  const isLiked = liked ?? ownLiked;
  const isQueued = queued ?? ownQueued;
  const controlledPos = position !== undefined;
  const queueCount = upNext.length + (isQueued ? 1 : 0);

  const [hovering, setHovering] = React.useState(false);
  const [focusVisible, setFocusVisible] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [lane, setLane] = React.useState<Lane>({ w: 640, h: 56 });
  const [sec, setSec] = React.useState(() =>
    Math.floor(clamp(position ?? defaultPosition, 0, dur)),
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const [pageVisible, setPageVisible] = React.useState(true);
  const [said, setSaid] = React.useState<{
    kind: "like" | "queue";
    want: boolean;
    alsoQueued?: boolean;
  } | null>(null);
  const [resync, setResync] = React.useState(0);

  const pos = useMotionValue(clamp(position ?? defaultPosition, 0, dur));
  const riseClock = useMotionValue(0);
  const level = useMotionValue(0);
  const origin = useMotionValue(0);
  const hover = useMotionValue(0);
  const hoverOn = useMotionValue(0);
  const discX = useMotionValue(isPlaying ? out : REST);
  const angle = useMotionValue(0);
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fr = useMotionValue(0);
  const fo = useMotionValue(0);
  const badgeScale = useMotionValue(1);
  const roll = useMotionValue(1);
  const rollDir = useMotionValue(1);
  const rollPrev = useMotionValue(String(queueCount));
  const rollNext = useMotionValue(String(queueCount));
  const heartScale = useMotionValue(1);

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const [band, setBand] = React.useState<HTMLDivElement | null>(null);
  const [panel, setPanel] = React.useState<HTMLDivElement | null>(null);
  const badgeRef = React.useRef<HTMLButtonElement | null>(null);
  const likeRef = React.useRef<HTMLButtonElement | null>(null);
  const queueRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const omega = React.useRef(0);
  const seeking = React.useRef(false);
  const dragRef = React.useRef(false);
  const dragFrom = React.useRef(0);
  const keyTarget = React.useRef<number | null>(null);
  const lastBar = React.useRef(-1);
  const entry = React.useRef<number | null>(null);
  const pressedAt = React.useRef(-Infinity);
  const throwFrom = React.useRef<"like" | "queue" | null>(null);
  const landingAt = React.useRef(0);
  const secRef = React.useRef(sec);
  const ghost = React.useRef(false);
  const latest = React.useRef<Latest | null>(null);

  const heights = React.useMemo(() => waveform(seed, count), [seed, count]);
  const fullD = React.useMemo(
    () => barsPath(heights, lane, () => 1),
    [heights, lane],
  );
  const stubD = React.useMemo(
    () => barsPath(heights, lane, () => 0),
    [heights, lane],
  );
  const centres = React.useMemo(
    () => heights.map((_, i) => (i + 0.5) / heights.length),
    [heights],
  );

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const visitorBeat = () => performance.now() - pressedAt.current < BEAT;
  const panOf = (el: Element | null | undefined) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /** A pointer's x as a share of the lane, which spans the whole card. */
  const shareAt = (clientX: number) => {
    const rect = band?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  };

  // ---- the lane's measured size, bound to the node when it arrives -------
  React.useEffect(() => {
    if (!band) return;
    const measure = () => {
      const w = Math.round(band.clientWidth);
      const h = Math.round(band.clientHeight);
      if (w > 0 && h > 0)
        setLane((l) => (l.w === w && l.h === h ? l : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(band);
    return () => observer.disconnect();
  }, [band]);

  // ---- nothing turns or plays on while the card is off screen or hidden --
  React.useEffect(() => {
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setOnScreen(e.isIntersecting);
    });
    observer.observe(root);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [root]);

  // ---- whole seconds, for the slider's value (the text rides a motion value)
  React.useEffect(
    () =>
      pos.on("change", (v) => {
        const s = Math.floor(v);
        if (s !== secRef.current) {
          secRef.current = s;
          setSec(s);
        }
      }),
    [pos],
  );

  // ---- the waveform stands up or lies down -------------------------------
  const shown =
    !disabled &&
    (reveal === "always" ||
      hovering ||
      focusVisible ||
      isPlaying ||
      dragging ||
      open);

  React.useEffect(() => {
    if (!motionSafe) {
      run(
        "level",
        animate(level, shown ? 1 : 0, {
          duration: durations.base,
          ease: shown ? easings.enter : easings.exit,
        }),
      );
      return;
    }
    if (shown) {
      if (level.get() < 0.02) {
        // A fresh rise ripples out from where the pointer came in, or from
        // the playhead when the keyboard or play brought it up.
        origin.set(r3(entry.current ?? clamp01(pos.get() / dur)));
        riseClock.jump(0);
        level.jump(1);
      }
      // Finished, not frozen, if a re-run interrupts it.
      const left = Math.max(0, RISE - riseClock.get());
      run("rise", animate(riseClock, RISE, { duration: left, ease: "linear" }));
      run(
        "level",
        animate(level, 1, { duration: durations.fast, ease: easings.enter }),
      );
    } else {
      run("level", animate(level, 0, exitFor(durations.base)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, motionSafe]);

  // ---- the record: resting, peeking on hover, half out while playing ------
  const discTarget = isPlaying
    ? out
    : !disabled && (hovering || focusVisible)
      ? lerp(REST, out, 0.3)
      : REST;
  React.useEffect(() => {
    if (!motionSafe) {
      anims.current.get("disc")?.stop();
      discX.jump(discTarget);
      return;
    }
    run("disc", animate(discX, discTarget, springs.glide));
  }, [discTarget, motionSafe, discX]);

  // ---- the turntable: spin-up, playback and spin-down share one small loop
  // that only runs while something is turning or playing, on screen.
  const advancing = isPlaying && !controlledPos;
  React.useEffect(() => {
    const target = isPlaying && motionSafe ? rpm * 6 : 0;
    if (!motionSafe) omega.current = 0;
    if (!onScreen || !pageVisible) return;
    if (!advancing && target === 0 && omega.current < 0.5) {
      omega.current = 0;
      return;
    }
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      // A motor that takes a moment to come up to speed, and a brake that
      // stops it a little quicker than that.
      const lag = target > omega.current ? 0.6 : 0.35;
      omega.current += (target - omega.current) * (1 - Math.exp(-dt / lag));
      if (omega.current > 0.05) {
        angle.set(r2((angle.get() + omega.current * dt) % 360));
      }
      if (advancing && !dragRef.current && !seeking.current) {
        const next = pos.get() + dt;
        if (next >= dur) {
          pos.set(dur);
          latest.current?.ended();
          return;
        }
        pos.set(r3(next));
      }
      if (!advancing && target === 0 && omega.current < 0.5) {
        omega.current = 0;
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [
    advancing,
    isPlaying,
    motionSafe,
    rpm,
    onScreen,
    pageVisible,
    dur,
    angle,
    pos,
  ]);

  // ---- a controlled playhead follows its host, gliding on a real seek ----
  React.useEffect(() => {
    if (position === undefined || dragRef.current) return;
    const to = clamp(position, 0, dur);
    if (Math.abs(to - pos.get()) < 0.01) return;
    if (motionSafe && Math.abs(to - pos.get()) > 2) {
      seeking.current = true;
      run(
        "pos",
        animate(pos, to, {
          ...springs.glide,
          onComplete: () => {
            seeking.current = false;
          },
        }),
      );
    } else {
      anims.current.get("pos")?.stop();
      pos.set(to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, resync, controlledPos, dur, motionSafe]);

  // ---- the heart pops when it fills -----------------------------------------
  const likedShown = React.useRef(isLiked);
  React.useEffect(() => {
    if (likedShown.current === isLiked) return;
    likedShown.current = isLiked;
    if (!motionSafe) return;
    heartScale.jump(isLiked ? 0.7 : 0.9);
    run(
      "heart",
      animate(heartScale, 1, isLiked ? springs.snap : springs.flick),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLiked, motionSafe]);

  // ---- a track lined up is thrown into the badge ----------------------------
  const queuedShown = React.useRef(isQueued);
  React.useEffect(() => {
    if (queuedShown.current === isQueued) return;
    queuedShown.current = isQueued;
    if (!isQueued) return;
    const from =
      throwFrom.current === "like" ? likeRef.current : queueRef.current;
    throwFrom.current = null;
    const host = root;
    const badge = badgeRef.current;
    if (!motionSafe || !host || !from || !badge) {
      landingAt.current = 0;
      latest.current?.land();
      return;
    }
    const box = host.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = badge.getBoundingClientRect();
    const x0 = a.left + a.width / 2 - box.left;
    const y0 = a.top + a.height / 2 - box.top;
    const x2 = b.left + b.width / 2 - box.left;
    const y2 = b.top + b.height / 2 - box.top;
    // A quadratic curve on a linear clock is a parabola under constant
    // gravity; its control point stays inside the card, so the throw does.
    const x1 = x0 + (x2 - x0) * 0.35;
    const y1 = Math.max(12, Math.min(y0, y2) - 30);
    const tumble = x2 > x0 ? 200 : -200;
    landingAt.current = performance.now() + FLIGHT * 1000;
    fx.set(r2(x0 - 10));
    fy.set(r2(y0 - 10));
    fs.set(1);
    fr.set(0);
    fo.set(1);
    run(
      "flight",
      animate(0, 1, {
        duration: FLIGHT,
        ease: "linear",
        onUpdate: (t) => {
          const u = 1 - t;
          fx.set(r2(u * u * x0 + 2 * u * t * x1 + t * t * x2 - 10));
          fy.set(r2(u * u * y0 + 2 * u * t * y1 + t * t * y2 - 10));
          fs.set(r3(lerp(1, 0.45, t)));
          fr.set(r2(tumble * t));
          fo.set(r3(t > 0.85 ? (1 - t) / 0.15 : 1));
        },
        onComplete: () => {
          fo.set(0);
          latest.current?.land();
        },
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQueued]);

  // ---- the badge's count rolls when the throw lands (or at once) ----------
  const countShown = React.useRef(queueCount);
  React.useEffect(() => {
    if (countShown.current === queueCount) return;
    const from = countShown.current;
    countShown.current = queueCount;
    const go = () => {
      rollPrev.set(String(from));
      rollNext.set(String(queueCount));
      rollDir.set(queueCount > from ? 1 : -1);
      if (!motionSafe) {
        roll.jump(1);
        return;
      }
      roll.jump(0);
      run("roll", animate(roll, 1, springs.snap));
    };
    const wait = landingAt.current - performance.now();
    if (queueCount > from && wait > 0) {
      const id = window.setTimeout(go, Math.round(wait));
      return () => {
        window.clearTimeout(id);
        rollPrev.set(String(queueCount));
        rollNext.set(String(queueCount));
        roll.jump(1);
      };
    }
    go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueCount, motionSafe]);

  // ---- the panel: focus goes in when it arrives; a press outside closes it
  React.useEffect(() => {
    if (panel) panel.focus({ preventScroll: true });
  }, [panel]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Node)) return;
      if (panel?.contains(t) || badgeRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, panel]);

  React.useEffect(() => {
    const live = anims.current;
    return () => {
      for (const c of live.values()) c.stop();
      live.clear();
    };
  }, []);

  // ---- actions ----------------------------------------------------------------
  const setPlayingTo = (next: boolean) => {
    if (playing === undefined) setOwnPlaying(next);
    onPlayingChange?.(next);
  };

  const togglePlay = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const next = !isPlaying;
    pressedAt.current = performance.now();
    audio.play("tick", {
      pitch: next ? 0.8 : 0.6,
      gain: 0.5,
      pan: panOf(event.currentTarget),
    });
    if (next && !controlledPos && pos.get() >= dur - 0.25) {
      pos.jump(0);
      onPositionChange?.(0);
    }
    if (!next) onPositionChange?.(r2(pos.get()));
    setPlayingTo(next);
  };

  const ended = () => {
    setPlayingTo(false);
    onPositionChange?.(dur);
  };

  const land = () => {
    if (motionSafe) {
      badgeScale.jump(1.16);
      run("badge", animate(badgeScale, 1, springs.recoil));
    }
    if (visitorBeat()) {
      audio.play("blup", {
        pitch: r2(1 + Math.min(8, queueCount) * 0.04),
        gain: 0.6,
        pan: panOf(badgeRef.current),
      });
    }
  };

  // A layout effect, so the handlers are current before any passive effect
  // of the same commit (the throw, the count) reaches for them.
  React.useLayoutEffect(() => {
    latest.current = { ended, land };
  });

  const setQueuedTo = (next: boolean) => {
    if (queued === undefined) setOwnQueued(next);
    onQueuedChange?.(next);
  };

  const toggleLike = () => {
    if (disabled) return;
    const next = !isLiked;
    pressedAt.current = performance.now();
    if (liked === undefined) setOwnLiked(next);
    onLikedChange?.(next);
    const lineUp = next && likeQueues && !isQueued;
    setSaid({ kind: "like", want: next, alsoQueued: lineUp });
    if (lineUp) {
      throwFrom.current = "like";
      setQueuedTo(true);
    }
  };

  const toggleQueue = () => {
    if (disabled) return;
    const next = !isQueued;
    pressedAt.current = performance.now();
    throwFrom.current = next ? "queue" : null;
    setSaid({ kind: "queue", want: next });
    setQueuedTo(next);
  };

  const removeFromQueue = () => {
    if (disabled) return;
    // The row leaves: focus stays in the panel rather than falling to the page.
    panel?.focus({ preventScroll: true });
    setSaid({ kind: "queue", want: false });
    setQueuedTo(false);
  };

  const closePanel = (giveBack: boolean) => {
    setOpen(false);
    if (giveBack) badgeRef.current?.focus({ preventScroll: true });
  };

  /** Seek to a time; the playhead glides there unless a finger is on it. */
  const seek = (seconds: number, glide: boolean) => {
    const to = r2(clamp(seconds, 0, dur));
    if (!controlledPos || dragRef.current) {
      if (motionSafe && glide) {
        seeking.current = true;
        run(
          "pos",
          animate(pos, to, {
            ...springs.glide,
            onComplete: () => {
              seeking.current = false;
              keyTarget.current = null;
            },
          }),
        );
      } else {
        anims.current.get("pos")?.stop();
        seeking.current = false;
        keyTarget.current = null;
        pos.set(to);
      }
    }
    onPositionChange?.(to);
    // A controlled host answers on its own schedule; once it has had its
    // turn, a playhead it did not take goes back to where it says.
    if (controlledPos) React.startTransition(() => setResync((n) => n + 1));
  };

  /** The ghost playhead and its time chip, faded in or out once each way. */
  const showGhost = (on: boolean) => {
    if (ghost.current === on) return;
    ghost.current = on;
    run(
      "hoverOn",
      animate(
        hoverOn,
        on ? 1 : 0,
        on ? { duration: durations.fast } : exitFor(durations.fast),
      ),
    );
  };

  const detent = (share: number, el: Element | null) => {
    const bar = Math.floor(share * count);
    if (lastBar.current !== -1 && Math.abs(bar - lastBar.current) < 2) return;
    lastBar.current = bar;
    audio.play("tick", {
      pitch: r2(0.75 + share * 0.7),
      gain: 0.32,
      pan: panOf(el),
    });
  };

  const scrubTo = (clientX: number) => {
    const share = shareAt(clientX);
    pos.set(r3(share * dur));
    hover.set(r3(share));
    detent(share, band);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      dragRef.current = true;
      dragFrom.current = pos.get();
      pressedAt.current = performance.now();
      lastBar.current = -1;
      anims.current.get("pos")?.stop();
      seeking.current = false;
      setDragging(true);
      showGhost(true);
      scrubTo(point.x);
    },
    onMove: ({ point }) => scrubTo(point.x),
    onEnd: ({ point, event }) => {
      const share = shareAt(point.x);
      seek(share * dur, false);
      dragRef.current = false;
      setDragging(false);
      // A finger lifts away and a mouse may have left mid-drag: the ghost
      // playhead only stays while a hovering pointer is still over the card.
      if (event.pointerType === "touch" || !hovering) showGhost(false);
    },
    onCancel: () => {
      dragRef.current = false;
      setDragging(false);
      showGhost(false);
      seek(dragFrom.current, true);
    },
    onTap: (event) => {
      pressedAt.current = performance.now();
      const share = shareAt(event.clientX);
      audio.play("tick", {
        pitch: r2(0.75 + share * 0.7),
        gain: 0.4,
        pan: panOf(band),
      });
      seek(share * dur, true);
    },
  });

  const onLaneKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const from = keyTarget.current ?? pos.get();
    let to: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        to = from + 5;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        to = from - 5;
        break;
      case "PageUp":
        to = from + 30;
        break;
      case "PageDown":
        to = from - 30;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = dur;
        break;
    }
    if (to === null) return;
    event.preventDefault();
    const target = clamp(to, 0, dur);
    keyTarget.current = target;
    pressedAt.current = performance.now();
    audio.play("tick", {
      pitch: r2(0.75 + (target / dur) * 0.7),
      gain: 0.4,
      pan: panOf(band),
    });
    seek(target, true);
  };

  // ---- per-frame geometry (motion values, never React state per frame) ------
  const waveD = useTransform(
    [riseClock, level, origin] as MotionValue<number>[],
    ([t = 0, l = 0, o = 0]: number[]) =>
      l <= 0.001
        ? stubD
        : barsPath(heights, lane, (i) => {
            const delay = Math.abs((centres[i] ?? 0) - o) * SPREAD;
            return l * snapStep(t - delay);
          }),
  );
  const fullOpacity = useTransform(level, (l) => r3(clamp01(l)));
  const playedW = useTransform(pos, (p) => r2(clamp01(p / dur) * lane.w));
  const playX = useTransform(playedW, (w) => r2(Math.max(0, w - 0.75)));
  // No line pinned to the card's left edge before anything has played.
  const playOpacity = useTransform(
    [level, pos] as MotionValue<number>[],
    ([l = 0, p = 0]: number[]) => (p > 0.05 ? r3(clamp01(l)) : 0),
  );
  const hoverW = useTransform(hover, (s) => r2(s * lane.w));
  const hoverX = useTransform(hoverW, (w) => r2(Math.max(0, w - 0.5)));
  const chipX = useTransform(hoverW, (w) =>
    r2(clamp(w - 20, 4, Math.max(4, lane.w - 44))),
  );
  const chipText = useTransform(hover, (s) => clock(s * dur));
  const posText = useTransform(pos, (p) => clock(p));
  const discShift = useTransform(discX, (v) => `${r2(v * 100)}%`);
  const prevY = useTransform(
    [roll, rollDir] as MotionValue<number>[],
    ([r = 1, d = 1]: number[]) => `${r2(-r * 100 * d)}%`,
  );
  const nextY = useTransform(
    [roll, rollDir] as MotionValue<number>[],
    ([r = 1, d = 1]: number[]) => `${r2((1 - r) * 100 * d)}%`,
  );
  const prevOpacity = useTransform(roll, (r) => r3(1 - clamp01(r)));

  const name = track.title;
  const sentence = (() => {
    if (!said) return "";
    if (said.kind === "like") {
      if (said.want !== isLiked) return "";
      if (!isLiked) return `Removed the like from ${name}.`;
      return said.alsoQueued && isQueued
        ? `Liked ${name} and added it to up next. ${plural(queueCount, "track", "tracks")}.`
        : `Liked ${name}.`;
    }
    if (said.want !== isQueued) return "";
    return isQueued
      ? `${name} added to up next. ${plural(queueCount, "track", "tracks")}.`
      : `${name} removed from up next. ${plural(queueCount, "track", "tracks")}.`;
  })();

  const rows: (TrackCardItem & { mine?: boolean })[] = [
    ...upNext,
    ...(isQueued ? [{ ...track, mine: true }] : []),
  ];
  const digits = String(Math.max(queueCount, 9)).length;
  const reserve = r3(1 + 0.94 * out + 0.03);

  const iconButton = cn(
    "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
  );

  const laneLayers = (
    d: string | MotionValue<string>,
    opacity?: MotionValue<number>,
  ) => (
    <motion.g style={opacity ? { opacity } : undefined}>
      <motion.path d={d} className="fill-ink-3/35" />
      <g clipPath={`url(#${previewClip})`}>
        <motion.g style={{ opacity: hoverOn }}>
          <g style={{ fill: accent }} opacity="0.45">
            <motion.path d={d} />
          </g>
        </motion.g>
      </g>
      <g clipPath={`url(#${playedClip})`} style={{ fill: accent }}>
        <motion.path d={d} />
      </g>
    </motion.g>
  );

  return (
    <article
      ref={setRoot}
      aria-labelledby={titleId}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch" || disabled) return;
        entry.current = shareAt(event.clientX);
        hover.set(r3(entry.current));
        setHovering(true);
        if (!open) showGhost(true);
      }}
      onPointerMove={(event) => {
        if (
          event.pointerType === "touch" ||
          disabled ||
          dragRef.current ||
          open
        ) {
          return;
        }
        hover.set(r3(shareAt(event.clientX)));
        // Back after the panel closed, without a new pointerenter.
        showGhost(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        entry.current = null;
        setHovering(false);
        if (!dragRef.current) showGhost(false);
      }}
      onFocus={(event) => {
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          setFocusVisible(true);
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setFocusVisible(false);
        }
      }}
      onKeyDown={(event) => {
        // Escape is caught here, wherever focus is in the card, and kept
        // from the page so nothing else closes with it.
        if (event.key === "Escape" && open) {
          event.preventDefault();
          const inside =
            document.activeElement instanceof Node &&
            event.currentTarget.contains(document.activeElement);
          closePanel(inside);
        }
      }}
      className={cn(
        "@container relative w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          "--tc-narrow": `${sleeve.narrow}px`,
          "--tc-wide": `${sleeve.wide}px`,
        } as React.CSSProperties
      }
    >
      {/* The sleeve size is set here, inside the container it queries. */}
      <div className="flex items-start gap-3 p-3.5 [--tc-sleeve:var(--tc-narrow)] @xl:gap-5 @xl:p-5 @xl:[--tc-sleeve:var(--tc-wide)]">
        {/* The art block reserves the room the record slides into. */}
        <div
          className="relative h-[var(--tc-sleeve)] shrink-0"
          style={{ width: `calc(var(--tc-sleeve) * ${reserve})` }}
        >
          <motion.div
            aria-hidden
            className="absolute top-[3%] left-[calc(var(--tc-sleeve)*0.03)] size-[calc(var(--tc-sleeve)*0.94)]"
            style={{ x: discShift }}
          >
            <motion.div className="size-full" style={{ rotate: angle }}>
              <Vinyl seed={seed} accent={accent} />
            </motion.div>
            {/* The light does not turn with the record: only the label does. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 200deg, transparent 0deg, oklch(1 0 0 / 0.16) 26deg, transparent 58deg, transparent 180deg, oklch(1 0 0 / 0.1) 206deg, transparent 238deg)",
              }}
            />
          </motion.div>
          <div className="absolute top-0 left-0 size-[var(--tc-sleeve)] overflow-clip rounded-2 border border-hairline-strong bg-surface-2 shadow-[0_8px_18px_-10px_color-mix(in_oklab,black_55%,transparent)]">
            {art ?? <CoverArt seed={seed} accent={accent} id={artId} />}
            <span
              aria-hidden
              className="absolute inset-y-[6%] right-0 w-px bg-[color-mix(in_oklab,black_35%,transparent)]"
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col self-stretch">
          <div className="flex h-6 items-center justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {track.release ?? "Track"}
            </p>
            <motion.button
              ref={badgeRef}
              type="button"
              disabled={disabled}
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              aria-label={`Up next, ${plural(queueCount, "track", "tracks")}`}
              onClick={() => {
                if (open) {
                  closePanel(true);
                  return;
                }
                showGhost(false);
                setOpen(true);
              }}
              style={{ scale: badgeScale }}
              className={cn(
                "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 font-mono text-[11px] tabular-nums transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed",
                open
                  ? "border-hairline-strong bg-surface-2 text-foreground"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <ListMusic aria-hidden className="size-3.5 shrink-0" />
              <span
                aria-hidden
                className="relative inline-grid h-4 overflow-clip text-center leading-4"
                style={{ width: `${digits}ch` }}
              >
                <motion.span
                  className="[grid-area:1/1]"
                  style={{ y: prevY, opacity: prevOpacity }}
                >
                  {rollPrev}
                </motion.span>
                <motion.span className="[grid-area:1/1]" style={{ y: nextY }}>
                  {rollNext}
                </motion.span>
              </span>
            </motion.button>
          </div>
          <h3
            id={titleId}
            title={track.title}
            className="mt-0.5 truncate text-sm leading-5 font-medium text-foreground @xl:text-base @xl:leading-6"
          >
            {track.title}
          </h3>
          <p
            title={track.artist}
            className="truncate text-xs leading-4 text-ink-2 @xl:text-sm @xl:leading-5"
          >
            {track.artist}
          </p>
          <div className="mt-2 flex items-center gap-1.5 @xl:mt-auto">
            <button
              type="button"
              disabled={disabled}
              aria-label={`${isPlaying ? "Pause" : "Play"} ${name}`}
              onClick={togglePlay}
              className={cn(
                "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-foreground text-background transition-opacity outline-none",
                "w-8 @xl:w-auto @xl:pr-3.5 @xl:pl-3",
                "hover:opacity-90",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <span
                aria-hidden
                className="relative grid size-4 shrink-0 place-items-center"
              >
                <motion.span
                  className="[grid-area:1/1]"
                  initial={false}
                  animate={{
                    opacity: isPlaying ? 0 : 1,
                    scale: isPlaying && motionSafe ? 0.6 : 1,
                  }}
                  transition={
                    motionSafe ? springs.flick : { duration: durations.fast }
                  }
                >
                  <Play className="size-4 fill-current" />
                </motion.span>
                <motion.span
                  className="[grid-area:1/1]"
                  initial={false}
                  animate={{
                    opacity: isPlaying ? 1 : 0,
                    scale: !isPlaying && motionSafe ? 0.6 : 1,
                  }}
                  transition={
                    motionSafe ? springs.flick : { duration: durations.fast }
                  }
                >
                  <Pause className="size-4 fill-current" />
                </motion.span>
              </span>
              <span
                aria-hidden
                className="hidden text-xs font-medium @xl:inline-grid"
              >
                <span
                  className={cn("[grid-area:1/1]", isPlaying && "invisible")}
                >
                  Play
                </span>
                <span
                  className={cn("[grid-area:1/1]", !isPlaying && "invisible")}
                >
                  Pause
                </span>
              </span>
            </button>
            <button
              ref={likeRef}
              type="button"
              disabled={disabled}
              aria-pressed={isLiked}
              aria-label={`Like ${name}`}
              onClick={toggleLike}
              className={cn(
                iconButton,
                isLiked && "text-danger hover:text-danger",
              )}
            >
              <motion.span
                aria-hidden
                className="inline-flex"
                style={{ scale: heartScale }}
              >
                <Heart className={cn("size-4", isLiked && "fill-current")} />
              </motion.span>
            </button>
            <button
              ref={queueRef}
              type="button"
              disabled={disabled}
              aria-pressed={isQueued}
              aria-label={`Add ${name} to up next`}
              onClick={toggleQueue}
              className={cn(
                iconButton,
                isQueued && "text-cobalt-bright hover:text-cobalt-bright",
              )}
            >
              {isQueued ? (
                <ListCheck aria-hidden className="size-4" />
              ) : (
                <ListPlus aria-hidden className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* The lane is the card's bottom edge. */}
      <div
        ref={setBand}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Seek ${name}`}
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={clamp(sec, 0, Math.round(dur))}
        aria-valuetext={`${clock(sec)} of ${clock(dur)}`}
        aria-disabled={disabled || undefined}
        onKeyDown={onLaneKey}
        {...drag}
        className={cn(
          "relative block h-11 w-full touch-pan-y outline-none select-none @xl:h-14",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <svg
          aria-hidden
          width="100%"
          height="100%"
          viewBox={`0 0 ${lane.w} ${lane.h}`}
          preserveAspectRatio="none"
          shapeRendering="crispEdges"
          className="absolute inset-0 block"
        >
          <defs>
            <clipPath id={playedClip}>
              <motion.rect x={0} y={0} height={lane.h} width={playedW} />
            </clipPath>
            <clipPath id={previewClip}>
              <motion.rect x={0} y={0} height={lane.h} width={hoverW} />
            </clipPath>
          </defs>
          {motionSafe ? (
            laneLayers(waveD)
          ) : (
            <>
              {laneLayers(stubD)}
              {laneLayers(fullD, fullOpacity)}
            </>
          )}
          <motion.rect
            x={hoverX}
            y={LABELS - 2}
            width={1}
            height={Math.max(0, lane.h - LABELS + 2)}
            className="fill-ink-2"
            style={{ opacity: hoverOn }}
          />
          <g style={{ fill: accent }}>
            <motion.rect
              x={playX}
              y={LABELS - 4}
              width={1.5}
              height={Math.max(0, lane.h - LABELS + 4)}
              style={{ opacity: playOpacity }}
            />
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-x-3.5 top-1 flex justify-between font-mono text-[10px] leading-3 text-ink-3 tabular-nums @xl:inset-x-5">
          <motion.span>{posText}</motion.span>
          <span>{clock(dur)}</span>
        </div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0.5 left-0 w-10 rounded-1 bg-popover text-center font-mono text-[10px] leading-4 text-foreground tabular-nums shadow-[0_0_0_1px_var(--hairline-strong)]"
          style={{ x: chipX, opacity: hoverOn }}
        >
          {chipText}
        </motion.span>
      </div>

      {/* The thrown copy of the cover. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-30 size-5 rounded-1 shadow-[0_4px_10px_-4px_color-mix(in_oklab,black_60%,transparent)]"
        style={{
          x: fx,
          y: fy,
          scale: fs,
          rotate: fr,
          opacity: fo,
          background: coverWash(accent, seed),
        }}
      />

      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            ref={setPanel}
            id={panelId}
            role="region"
            tabIndex={-1}
            aria-labelledby={panelTitleId}
            initial={
              motionSafe
                ? { opacity: 0, scale: 0.94, y: -distances.nudge }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: motionSafe ? 0.97 : 1,
              transition: exitFor(),
            }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            style={{ originX: 1, originY: 0 }}
            className={cn(
              "absolute inset-2 z-40 flex flex-col overflow-clip rounded-3 border border-hairline-strong bg-popover outline-none @xl:left-auto @xl:w-72",
              "shadow-[0_12px_32px_-12px_color-mix(in_oklab,black_50%,transparent)]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
          >
            <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-hairline pr-1 pl-3">
              <h4
                id={panelTitleId}
                className="text-xs font-medium text-foreground"
              >
                Up next
                <span className="ml-1.5 font-mono text-[11px] text-ink-3 tabular-nums">
                  {rows.length}
                </span>
              </h4>
              <button
                type="button"
                aria-label="Close up next"
                onClick={() => closePanel(true)}
                className={cn(iconButton, "size-7")}
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <ol
              role="list"
              className="flex-1 overflow-auto overscroll-contain p-1"
            >
              {rows.length === 0 ? (
                <li className="px-2 py-3 text-xs text-ink-3">
                  Nothing lined up yet.
                </li>
              ) : null}
              {rows.map((row, i) => (
                <motion.li
                  key={row.id}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          delay: 0.04 + i * cascade(rows.length),
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-2 px-1.5",
                    row.mine && "bg-cobalt-wash",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-6 shrink-0 rounded-1"
                    style={{
                      background: coverWash(
                        accent,
                        `${row.id}:${row.title}:${row.artist}`,
                      ),
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      title={row.title}
                      className="block truncate text-xs leading-4 font-medium text-foreground"
                    >
                      {row.title}
                    </span>
                    <span
                      title={row.artist}
                      className="block truncate text-[11px] leading-4 text-ink-3"
                    >
                      {row.artist}
                    </span>
                  </span>
                  {row.mine ? (
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remove ${row.title} from up next`}
                      onClick={removeFromQueue}
                      className={cn(iconButton, "size-7")}
                    >
                      <X aria-hidden className="size-3.5" />
                    </button>
                  ) : (
                    <span className="shrink-0 pr-1 font-mono text-[10px] text-ink-3 tabular-nums">
                      {clock(row.duration)}
                    </span>
                  )}
                </motion.li>
              ))}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <span role="status" aria-live="polite" className="sr-only">
        {sentence}
      </span>
    </article>
  );
}
