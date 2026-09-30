"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  rubberband,
  useDrag,
  type Point,
} from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StoryCubeStory = {
  /** Stable id, unique within its person. */
  id: string;
  /** What the story shows, in a few words: the picture's accessible name. */
  label: string;
  /** The picture. It fills the face: procedural art, an image, anything. */
  content: React.ReactNode;
  /** A line drawn over the bottom of the picture. */
  caption?: string;
};

export type StoryCubePerson = {
  /** Stable id: the value names a person by it. */
  id: string;
  name: string;
  /** When they posted, as it should read: "2h". */
  posted?: string;
  stories: readonly StoryCubeStory[];
};

export type StoryCubeValue = {
  /** The person's id. */
  person: string;
  /** Which of their stories, from 0. */
  story: number;
};

export type StoryCubeBars = "split" | "single" | "ring";

export type StoryCubeProps = {
  /** Everyone with stories, in the order the cube turns through them. */
  people: readonly StoryCubePerson[];
  /** Controlled position: whose story, and which. */
  value?: StoryCubeValue;
  /** Starting position when uncontrolled. @default the first person, story 0 */
  defaultValue?: StoryCubeValue;
  /** Fires from the tap, swipe, key or autoplay that moved it. */
  onValueChange?: (value: StoryCubeValue) => void;
  /** Controlled: whether the viewer is open over the tray. */
  open?: boolean;
  /** @default false */
  defaultOpen?: boolean;
  /** Fires from the swipe, key, tap or end of the stories that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** Seconds each story plays for before the next one, 2 to 10. @default 5 */
  duration?: number;
  /** How deep the cube reads when it turns, 0 (almost flat) to 1 (steep). @default 0.5 */
  depth?: number;
  /** How progress is drawn: a bar per story, one notched bar, or a ring around the avatar. @default "split" */
  bars?: StoryCubeBars;
  /** Stories play on their own and advance when full; off, each waits for a tap. @default true */
  autoplay?: boolean;
  /** The tray's name. @default "Stories" */
  label?: string;
  /** The screen under the tray: the host's feed. */
  children?: React.ReactNode;
  /** A tick per story and a whoosh when the cube turns. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type How = "auto" | "tap" | "key" | "swipe";

/** What the change about to render should sound and move like. */
type Launch = {
  /** A tick for the story that starts, panned here. */
  tick?: number;
  /** A whoosh for the turn or the close, with the throw's speed. */
  whoosh?: { speed: number; pan: number };
  /** Release velocity of a turn, in people per second. */
  turn?: number;
  /** Release velocity of the frame, px/s. */
  frame?: Point;
};

type Gesture = {
  mode: "turn" | "close" | "none" | null;
  start: number;
  raw: number;
  w: number;
  h: number;
};

type Gate = {
  open: boolean;
  autoplay: boolean;
  paused: boolean;
  disabled: boolean;
  seconds: number;
  held: boolean;
  dragging: boolean;
  turning: boolean;
  hidden: boolean;
  offscreen: boolean;
};

/** How long a still press must stay down before it pauses, ms. */
const HOLD_MS = 180;
/** The share of the picture, from the left, that steps back. */
const BACK_ZONE = 0.3;
/** A downward throw that would come to rest past this share of the height closes. */
const CLOSE_AT = 0.22;
/** How much the frame shrinks over a full-height pull. */
const SHRINK = 0.35;
/** Ring geometry, in the 36-unit box around the header avatar. */
const RING_C = 18;
const RING_R = 16.5;

const TONES = [
  "var(--accent-bright)",
  "var(--warn)",
  "var(--success)",
  "var(--danger)",
  "var(--signal)",
] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const toneOf = (i: number) => TONES[i % TONES.length] ?? TONES[0];
// A face colour that holds white initials in either theme.
const avatarFill = (tone: string) => `color-mix(in oklab, ${tone} 70%, black)`;
const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const sentence = (person: StoryCubePerson, index: number) => {
  const s = person.stories[index];
  const label = s?.label ?? "";
  const stop = /[.!?]$/.test(label) ? "" : ".";
  return `${person.name}, story ${index + 1} of ${person.stories.length}: ${label}${stop}`;
};

/** An arc of the ring, in degrees clockwise from the top. Rounded: trig differs by engine. */
function arc(from: number, to: number): string {
  const span = Math.min(359.9, to - from);
  if (span < 0.5) return "";
  const a0 = ((from - 90) * Math.PI) / 180;
  const a1 = ((from + span - 90) * Math.PI) / 180;
  const x0 = r3(RING_C + RING_R * Math.cos(a0));
  const y0 = r3(RING_C + RING_R * Math.sin(a0));
  const x1 = r3(RING_C + RING_R * Math.cos(a1));
  const y1 = r3(RING_C + RING_R * Math.sin(a1));
  return `M${x0} ${y0}A${RING_R} ${RING_R} 0 ${span > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * A value derived from a motion value, re-read after every commit. A face
 * that mounts in the same commit that moves the cube (opening at someone
 * else) would otherwise keep the angle it rendered with: StrictMode's second
 * effect pass cancels the update motion had scheduled for it.
 */
function useLive<T>(
  source: MotionValue<number>,
  read: (v: number) => T,
): MotionValue<T> {
  const out = useTransform(source, read);
  React.useEffect(() => {
    out.set(read(source.get()));
  });
  return out;
}

type ProgressProps = {
  count: number;
  story: number;
  fill: MotionValue<number>;
  /** The face on show: its current story's bar is the live one. */
  live: boolean;
  autoplay: boolean;
};

/** A bar per story, or one notched bar: seen full, the current one filling. */
function Bars({
  count,
  story,
  fill,
  live,
  autoplay,
  single,
}: ProgressProps & { single: boolean }) {
  // Without autoplay the current story's bar is shown full: it marks the
  // place rather than a countdown.
  const f = (v: number) => (!live ? 0 : autoplay ? clamp01(v) : 1);
  const current = useLive(fill, (v) => r3(f(v)));
  const whole = useLive(fill, (v) =>
    r3(clamp01((story + f(v)) / Math.max(1, count))),
  );
  if (single) {
    return (
      <span className="relative block h-[3px] overflow-clip rounded-full bg-white/35">
        <motion.span
          className="absolute inset-0 origin-left bg-white"
          style={{ scaleX: whole }}
        />
        {Array.from({ length: count - 1 }, (_, i) => (
          <span
            key={i}
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-black/55"
            style={{ left: `${r2(((i + 1) / count) * 100)}%` }}
          />
        ))}
      </span>
    );
  }
  return (
    <span className="flex gap-[3px]">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="relative block h-[3px] flex-1 overflow-clip rounded-full bg-white/35"
        >
          {i < story ? (
            <span className="absolute inset-0 bg-white" />
          ) : i === story ? (
            <motion.span
              className="absolute inset-0 origin-left bg-white"
              style={{ scaleX: current }}
            />
          ) : null}
        </span>
      ))}
    </span>
  );
}

/** Arcs around the avatar, one per story. */
function Ring({ count, story, fill, live, autoplay }: ProgressProps) {
  const seg = 360 / Math.max(1, count);
  const gap = count > 1 ? 10 : 0;
  const d = useLive(fill, (v) => {
    const f = !live ? 0 : autoplay ? clamp01(v) : 1;
    const from = story * seg + gap / 2;
    return arc(from, from + (seg - gap) * f);
  });
  return (
    <svg
      aria-hidden
      viewBox="0 0 36 36"
      className="pointer-events-none absolute inset-0 size-full fill-none"
      strokeWidth={2}
      strokeLinecap="round"
    >
      {Array.from({ length: count }, (_, i) =>
        count === 1 ? (
          <circle
            key={i}
            cx={RING_C}
            cy={RING_C}
            r={RING_R}
            className="stroke-white/35"
          />
        ) : (
          <path
            key={i}
            d={arc(i * seg + gap / 2, (i + 1) * seg - gap / 2)}
            className={i < story ? "stroke-white" : "stroke-white/35"}
          />
        ),
      )}
      <motion.path d={d} className="stroke-white" />
    </svg>
  );
}

type FaceProps = {
  person: StoryCubePerson;
  index: number;
  story: number;
  live: boolean;
  pos: MotionValue<number>;
  fill: MotionValue<number>;
  chrome: MotionValue<number>;
  shadeMax: number;
  bars: StoryCubeBars;
  autoplay: boolean;
  /** The header's buttons, on the face on show only. */
  controls: React.ReactNode;
};

/**
 * One side of the cube: a person's story, their header and its progress.
 * It sits at its own absolute angle, so which person is current never moves
 * it; it darkens as it turns away from the viewer.
 */
function Face({
  person,
  index,
  story,
  live,
  pos,
  fill,
  chrome,
  shadeMax,
  bars,
  autoplay,
  controls,
}: FaceProps) {
  const shade = useLive(pos, (p) =>
    r3(clamp01(Math.abs(index - p)) * shadeMax),
  );
  const s = person.stories[story];
  const count = person.stories.length;
  const tone = toneOf(index);
  return (
    <div
      aria-hidden={live ? undefined : true}
      inert={!live}
      className="absolute inset-0 overflow-clip bg-black backface-hidden"
      style={{ transform: `rotateY(${index * 90}deg) translateZ(50cqw)` }}
    >
      <div
        role="img"
        aria-label={s?.label}
        className="absolute inset-0 overflow-clip"
      >
        {s?.content}
      </div>
      <motion.div
        className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 bg-linear-to-b from-black/50 to-transparent px-2 pt-2 pb-5"
        style={{ opacity: chrome }}
      >
        {bars === "ring" ? null : (
          <Bars
            count={count}
            story={story}
            fill={fill}
            live={live}
            autoplay={autoplay}
            single={bars === "single"}
          />
        )}
        <div className="flex h-8 items-center gap-2">
          <span className="relative flex size-9 shrink-0 items-center justify-center">
            <span
              className="flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: avatarFill(tone) }}
            >
              {initialsOf(person.name)}
            </span>
            {bars === "ring" ? (
              <Ring
                count={count}
                story={story}
                fill={fill}
                live={live}
                autoplay={autoplay}
              />
            ) : null}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span
              className="truncate text-xs font-medium text-white"
              title={person.name}
            >
              {person.name}
            </span>
            {person.posted ? (
              <span className="shrink-0 text-xs text-white/70">
                {person.posted}
              </span>
            ) : null}
          </span>
          <span className="pointer-events-auto flex shrink-0 items-center">
            {controls}
          </span>
        </div>
      </motion.div>
      {s?.caption ? (
        <motion.p
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/55 to-transparent px-3 pt-8 pb-3 text-sm leading-snug text-white"
          style={{ opacity: chrome }}
        >
          {s.caption}
        </motion.p>
      ) : null}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-black"
        style={{ opacity: shade }}
      />
    </div>
  );
}

const iconButton =
  "flex size-8 items-center justify-center rounded-full text-white outline-none hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * A stories viewer on a cube, inside its own phone-shaped screen. Closed, the
 * screen shows a tray of people above the host's feed; a face opens the
 * viewer, which grows out of the avatar. Open, a tap on the right steps to
 * the next story and on the left to the previous one, a held press pauses
 * (and clears the header off the picture), and the bars fill over
 * `duration` seconds and advance on their own while `autoplay` is on.
 *
 * A sideways swipe turns a real CSS 3D cube to the next or previous person:
 * one frame width is one person, 1:1 under the finger, rubber-banded where
 * there is nobody to turn to; a release projects the throw and the cube
 * lands on `springs.glide` with the release velocity, each face darkening as
 * it turns away. A downward swipe lifts the whole frame with the finger,
 * shrinking and rounding it; let go far enough and it folds into a circle and
 * flies back into that person's avatar, otherwise it springs back. Every
 * face sits at its own absolute angle, so changing the person never moves
 * anything, and the face you leave keeps the story it was on.
 *
 * The viewer is a focusable group: Left and Right step, Shift with them (or
 * Page Up and Down) turns, Space pauses and Escape closes, with the same
 * sounds — a tick per story and a whoosh per turn. Under reduced motion
 * nothing rotates, flies or shrinks: turns and closes cross-fade, while the
 * bars, the pause and the sounds still answer.
 */
export function StoryCube({
  people,
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  duration = 5,
  depth = 0.5,
  bars = "split",
  autoplay = true,
  label = "Stories",
  children,
  sound = false,
  disabled = false,
  className,
}: StoryCubeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const n = people.length;
  const seconds = clamp(duration, 1, 60);
  const deep = clamp01(depth);
  const perspective = Math.round(lerp(400, 110, deep));
  const shadeMax = r2(lerp(0.12, 0.6, deep));

  const [own, setOwn] = React.useState<StoryCubeValue>(
    () => defaultValue ?? { person: people[0]?.id ?? "", story: 0 },
  );
  const held = value ?? own;
  const found = people.findIndex((p) => p.id === held.person);
  const personIndex = found < 0 ? 0 : found;
  const person = people[personIndex];
  const count = person?.stories.length ?? 0;
  const storyIndex = clamp(
    Math.round(held.story) || 0,
    0,
    Math.max(0, count - 1),
  );
  const key = `${person?.id ?? ""}:${storyIndex}`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = (open ?? ownOpen) && person !== undefined && count > 0;
  const [paused, setPaused] = React.useState(false);

  // Where each person was left, and how far into them anyone has got: the
  // face you turn away from keeps its story, and the tray knows who is new.
  const [track, setTrack] = React.useState(() =>
    isOpen && person
      ? {
          key,
          at: { [person.id]: storyIndex } as Record<string, number>,
          reached: { [person.id]: storyIndex } as Record<string, number>,
        }
      : {
          key: "",
          at: {} as Record<string, number>,
          reached: {} as Record<string, number>,
        },
  );
  if (isOpen && person && track.key !== key) {
    setTrack((t) => ({
      key,
      at: { ...t.at, [person.id]: storyIndex },
      reached: {
        ...t.reached,
        [person.id]: Math.max(t.reached[person.id] ?? -1, storyIndex),
      },
    }));
  }

  // The viewer stays on screen while it flies home after closing.
  const [openSeen, setOpenSeen] = React.useState(isOpen);
  const [leaving, setLeaving] = React.useState(false);
  if (openSeen !== isOpen) {
    setOpenSeen(isOpen);
    setLeaving(!isOpen);
  }
  const present = isOpen || leaving;

  // Spoken only while the state it describes still holds.
  const [said, setSaid] = React.useState<{ text: string; at: string } | null>(
    null,
  );
  const stateKey = isOpen ? `${key}|${paused ? "p" : "r"}` : "closed";

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const viewerRef = React.useRef<HTMLDivElement | null>(null);
  const trayRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const pos = useMotionValue(personIndex);
  const fill = useMotionValue(0);
  const vx = useMotionValue(0);
  const vy = useMotionValue(0);
  const vs = useMotionValue(1);
  const morph = useMotionValue(0);
  const vo = useMotionValue(1);
  const chrome = useMotionValue(1);
  const hintNext = useMotionValue(0);
  const hintPrev = useMotionValue(0);
  const boxW = useMotionValue(0);
  const boxH = useMotionValue(0);

  const turnRun = React.useRef<AnimationPlaybackControls | null>(null);
  const frameRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const fillRun = React.useRef<AnimationPlaybackControls | null>(null);
  const launchRef = React.useRef<Launch | null>(null);
  const focusNext = React.useRef<string | null>(null);
  const gesture = React.useRef<Gesture>({
    mode: null,
    start: 0,
    raw: 0,
    w: 1,
    h: 1,
  });
  const holdTimer = React.useRef(0);
  const holdFired = React.useRef(false);
  const holdRelease = React.useRef<(() => void) | null>(null);
  const gate = React.useRef<Gate>({
    open: isOpen,
    autoplay,
    paused,
    disabled,
    seconds,
    held: false,
    dragging: false,
    turning: false,
    hidden: false,
    offscreen: false,
  });
  const advanceRef = React.useRef<(how: How) => void>(() => {});

  const cube = useTransform(
    pos,
    (p) => `translateZ(-50cqw) rotateY(${r3(-p * 90)}deg)`,
  );
  // Pulled down, the frame starts folding toward a circle; closing, it gets
  // there, so it lands in the avatar as one.
  const clipPath = useTransform(
    [morph, boxW, boxH] as MotionValue<number>[],
    ([m, w, h]) => {
      const k = clamp01(m as number);
      if (k < 0.001 || (w as number) <= 0) return "none";
      const top = (k * Math.max(0, (h as number) - (w as number))) / 2;
      return `inset(${r2(top)}px 0px round ${r2((k * (w as number)) / 2)}px)`;
    },
  );

  /** The bars fill only while someone can watch and nothing is in the way. */
  const syncFill = React.useCallback(() => {
    const g = gate.current;
    const go =
      g.open &&
      g.autoplay &&
      !g.paused &&
      !g.disabled &&
      !g.held &&
      !g.dragging &&
      !g.turning &&
      !g.hidden &&
      !g.offscreen;
    if (go && !fillRun.current) {
      const from = clamp01(fill.get());
      // Full and still here: the host has not taken the advance. It waits
      // rather than asking again every frame.
      if (from >= 0.999) return;
      fillRun.current = animate(fill, 1, {
        duration: Math.max(0.05, (1 - from) * g.seconds),
        ease: "linear",
        onComplete: () => {
          fillRun.current = null;
          advanceRef.current("auto");
        },
      });
    } else if (!go && fillRun.current) {
      fillRun.current.stop();
      fillRun.current = null;
    }
  }, [fill]);

  const restartFill = () => {
    fillRun.current?.stop();
    fillRun.current = null;
    fill.set(0);
    syncFill();
  };

  const tickFor = (index: number, pan: number) => {
    audio.play("tick", {
      pitch: r3(semitones(Math.min(index, 8) * 2)),
      gain: 0.5,
      pan,
    });
  };

  const stopFrame = () => {
    for (const run of frameRuns.current) run.stop();
    frameRuns.current = [];
  };

  /** A short dip in opacity: the reduced-motion mark of a swap. */
  const dip = () => {
    stopFrame();
    vo.set(0.55);
    frameRuns.current = [
      animate(vo, 1, { duration: durations.fast, ease: easings.enter }),
    ];
  };

  const runTurn = (target: number, velocity = 0, swapped = false) => {
    turnRun.current?.stop();
    turnRun.current = null;
    const g = gate.current;
    if (!motionSafe) {
      pos.set(target);
      if (swapped) dip();
      g.turning = false;
      syncFill();
      return;
    }
    if (Math.abs(pos.get() - target) < 0.001 && Math.abs(velocity) < 0.01) {
      pos.set(target);
      g.turning = false;
      syncFill();
      return;
    }
    g.turning = true;
    syncFill();
    turnRun.current = animate(pos, target, {
      ...springs.glide,
      velocity,
      restDelta: 0.0005,
      restSpeed: 0.005,
      onComplete: () => {
        turnRun.current = null;
        gate.current.turning = false;
        syncFill();
      },
    });
  };

  /** Where the frame goes to become a person's avatar, in its own px. */
  const avatarTarget = (id: string) => {
    const button = trayRefs.current.get(id);
    if (!root || !button) return null;
    const box = root.getBoundingClientRect();
    const b = button.getBoundingClientRect();
    const w = boxW.get();
    const h = boxH.get();
    if (box.width <= 0 || w <= 0) return null;
    // Rects are on-screen px; the frame moves in its own. A scaled ancestor
    // would otherwise send it to the wrong place.
    const k = w / box.width;
    const cx = (b.left + b.width / 2 - box.left) * k;
    const cy = (b.top + b.height / 2 - box.top) * k;
    return {
      x: r2(clamp(cx, 0, w) - w / 2),
      y: r2(clamp(cy, 0, h) - h / 2),
      s: r3(clamp((b.width * k) / w, 0.05, 1)),
    };
  };

  const flyIn = () => {
    const was = frameRuns.current.length > 0;
    stopFrame();
    const target = person ? avatarTarget(person.id) : null;
    if (!motionSafe || !target) {
      vx.set(0);
      vy.set(0);
      vs.set(1);
      morph.set(0);
      if (!was) vo.set(0);
      frameRuns.current = [
        animate(vo, 1, { duration: durations.base, ease: easings.enter }),
      ];
      return;
    }
    // Reopened on its way home: it turns round where it is.
    if (!was) {
      vx.set(target.x);
      vy.set(target.y);
      vs.set(target.s);
      morph.set(1);
      vo.set(0);
    }
    frameRuns.current = [
      animate(vx, 0, springs.glide),
      animate(vy, 0, springs.glide),
      animate(vs, 1, springs.glide),
      animate(morph, 0, springs.glide),
      animate(vo, 1, { duration: durations.fast, ease: easings.enter }),
    ];
  };

  const flyOut = (velocity: Point) => {
    stopFrame();
    const finish = () => {
      frameRuns.current = [];
      vx.set(0);
      vy.set(0);
      vs.set(1);
      morph.set(0);
      setLeaving(false);
    };
    const target = person ? avatarTarget(person.id) : null;
    if (!motionSafe || !target) {
      frameRuns.current = [
        animate(vo, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: finish,
        }),
      ];
      return;
    }
    // A glide, not a bounce: closing is not a celebration.
    frameRuns.current = [
      animate(vx, target.x, { ...springs.glide, velocity: velocity.x }),
      animate(vy, target.y, { ...springs.glide, velocity: velocity.y }),
      animate(vs, target.s, { ...springs.glide, onComplete: finish }),
      animate(morph, 1, springs.glide),
      animate(vo, 0, {
        duration: durations.base,
        ease: easings.exit,
        delay: 0.16,
      }),
    ];
  };

  const settleFrame = (velocity: Point = { x: 0, y: 0 }) => {
    stopFrame();
    if (!motionSafe) {
      frameRuns.current = [
        animate(vo, 1, { duration: durations.fast, ease: easings.enter }),
      ];
      return;
    }
    frameRuns.current = [
      animate(vx, 0, { ...springs.snap, velocity: velocity.x }),
      animate(vy, 0, { ...springs.snap, velocity: velocity.y }),
      animate(vs, 1, springs.snap),
      animate(morph, 0, springs.snap),
      animate(vo, 1, { duration: durations.fast, ease: easings.enter }),
    ];
  };

  /** Reports a new position; the render it causes moves and sounds it. */
  const commit = (next: StoryCubeValue, launch: Launch | null) => {
    const p = people.find((q) => q.id === next.person);
    if (!p) return;
    const nextKey = `${next.person}:${next.story}`;
    if (nextKey === key) {
      // Stepping back from the very first story starts it again.
      restartFill();
      if (launch?.tick !== undefined) tickFor(next.story, launch.tick);
      return;
    }
    launchRef.current = launch;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    setSaid({
      text: sentence(p, next.story),
      at: `${nextKey}|${paused ? "p" : "r"}`,
    });
  };

  const resumeOf = (p: StoryCubePerson) =>
    clamp(track.at[p.id] ?? 0, 0, Math.max(0, p.stories.length - 1));

  const turnTo = (target: number, how: How, velocity = 0) => {
    const p = people[target];
    if (!p) return;
    const dir = Math.sign(target - personIndex);
    commit(
      { person: p.id, story: resumeOf(p) },
      how === "auto"
        ? { turn: velocity }
        : {
            turn: velocity,
            whoosh: { speed: Math.abs(velocity), pan: dir * 0.45 },
          },
    );
  };

  const closeViewer = (how: How, velocity: Point = { x: 0, y: 0 }) => {
    if (!isOpen) return;
    launchRef.current = {
      frame: velocity,
      whoosh:
        how === "auto"
          ? undefined
          : { speed: Math.hypot(velocity.x, velocity.y) / 1000, pan: 0 },
    };
    if (viewerRef.current?.contains(document.activeElement)) {
      focusNext.current = person?.id ?? null;
    }
    if (open === undefined) setOwnOpen(false);
    // Controlled: back where the host has it until it answers.
    else settleFrame(velocity);
    onOpenChange?.(false);
    setSaid({ text: "Stories closed.", at: "closed" });
  };

  const openAt = (p: StoryCubePerson) => {
    if (disabled || p.stories.length === 0) return;
    // Someone watched to the end starts again; anyone else resumes.
    const finished = (track.reached[p.id] ?? -1) >= p.stories.length - 1;
    const start = finished ? 0 : resumeOf(p);
    const nextKey = `${p.id}:${start}`;
    focusNext.current = "viewer";
    launchRef.current = { tick: 0 };
    // Closed, nothing shows the cube: it is put at the person now, so the
    // faces that mount with the viewer are drawn at the right angle.
    if (!present) {
      const index = people.indexOf(p);
      turnRun.current?.stop();
      turnRun.current = null;
      if (index >= 0) pos.set(index);
    }
    if (nextKey !== key) {
      if (value === undefined) setOwn({ person: p.id, story: start });
      onValueChange?.({ person: p.id, story: start });
    }
    if (open === undefined) setOwnOpen(true);
    onOpenChange?.(true);
    setSaid({
      text: sentence(p, start),
      at: `${nextKey}|${paused ? "p" : "r"}`,
    });
  };

  const advance = (how: How, pan = 0) => {
    if (!person || !isOpen) return;
    if (storyIndex < count - 1) {
      commit(
        { person: person.id, story: storyIndex + 1 },
        how === "auto" ? null : { tick: pan },
      );
    } else if (personIndex < n - 1) {
      turnTo(personIndex + 1, how);
    } else {
      closeViewer(how);
    }
  };

  const back = (how: How, pan = 0) => {
    if (!person || !isOpen) return;
    if (storyIndex > 0) {
      commit({ person: person.id, story: storyIndex - 1 }, { tick: pan });
    } else if (personIndex > 0) {
      turnTo(personIndex - 1, how);
    } else {
      commit({ person: person.id, story: 0 }, { tick: pan });
    }
  };

  /** A key's turn: to the neighbour, or a nudge where there is none. */
  const turnBy = (dir: 1 | -1) => {
    const target = personIndex + dir;
    if (target >= 0 && target < n) {
      turnTo(target, "key");
      return;
    }
    if (!motionSafe) return;
    turnRun.current?.stop();
    turnRun.current = animate(pos, personIndex + dir * 0.06, {
      ...springs.flick,
      onComplete: () => runTurn(personIndex),
    });
  };

  const togglePause = () => {
    if (disabled || !isOpen) return;
    const next = !paused;
    setPaused(next);
    setSaid({
      text: next ? "Paused." : "Playing.",
      at: `${key}|${next ? "p" : "r"}`,
    });
  };

  React.useEffect(() => {
    advanceRef.current = (how) => advance(how);
  });

  // Moves, turns, opens and closes follow the value, whoever changed it. A
  // gesture or key leaves a launch behind it with its velocity and sounds;
  // a change from the host has none, so it moves silently.
  const shown = React.useRef({ key, person: personIndex, open: isOpen });
  React.useLayoutEffect(() => {
    const was = shown.current;
    const launch = launchRef.current;
    launchRef.current = null;
    const moved = was.key !== key;
    const turned = was.person !== personIndex;
    const toggled = was.open !== isOpen;
    if (!moved && !turned && !toggled) return;
    shown.current = { key, person: personIndex, open: isOpen };
    gate.current.open = isOpen;
    if (turned) {
      if (!was.open || !isOpen) {
        turnRun.current?.stop();
        turnRun.current = null;
        gate.current.turning = false;
        pos.set(personIndex);
      } else if (gesture.current.mode !== "turn") {
        runTurn(personIndex, launch?.turn ?? 0, true);
        if (launch?.whoosh) {
          const k = clamp01(launch.whoosh.speed / 6);
          audio.play("whoosh", {
            pitch: r2(0.85 + k * 0.45),
            gain: r2(0.4 + k * 0.25),
            pan: launch.whoosh.pan,
          });
        }
      }
    }
    if (toggled) {
      if (isOpen) {
        flyIn();
        if (fill.get() >= 0.999) fill.set(0);
        if (launch?.tick !== undefined) tickFor(storyIndex, launch.tick);
      } else {
        flyOut(launch?.frame ?? { x: 0, y: 0 });
        if (launch?.whoosh) {
          audio.play("whoosh", { pitch: 0.62, gain: 0.32, pan: 0 });
        }
      }
    }
    if (moved) {
      fillRun.current?.stop();
      fillRun.current = null;
      fill.set(0);
      if (!turned && !toggled && launch?.tick !== undefined) {
        tickFor(storyIndex, launch.tick);
      }
    }
    syncFill();
  });

  // Props that gate the bars.
  React.useEffect(() => {
    const g = gate.current;
    g.open = isOpen;
    g.autoplay = autoplay;
    g.paused = paused;
    g.disabled = disabled;
    if (g.seconds !== seconds) {
      g.seconds = seconds;
      fillRun.current?.stop();
      fillRun.current = null;
    }
    syncFill();
  }, [isOpen, autoplay, paused, disabled, seconds, syncFill]);

  // A hidden page or a screen scrolled away stops the clock; the size is
  // what the fold and the flight are measured in.
  React.useEffect(() => {
    if (!root) return;
    const onVisibility = () => {
      gate.current.hidden = document.visibilityState === "hidden";
      syncFill();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    const measure = () => {
      boxW.set(root.clientWidth);
      boxH.set(root.clientHeight);
    };
    measure();
    const resize =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    resize?.observe(root);
    const seen =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            const last = entries[entries.length - 1];
            if (!last) return;
            gate.current.offscreen = !last.isIntersecting;
            syncFill();
          });
    seen?.observe(root);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      resize?.disconnect();
      seen?.disconnect();
    };
  }, [root, boxW, boxH, syncFill]);

  // Focus follows the viewer in and back out to the face it closed into.
  React.useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    if (target === "viewer") {
      if (!isOpen) return;
      focusNext.current = null;
      viewerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (isOpen) return;
    focusNext.current = null;
    trayRefs.current.get(target)?.focus({ preventScroll: true });
  });

  React.useEffect(
    () => () => {
      turnRun.current?.stop();
      turnRun.current = null;
      for (const run of frameRuns.current) run.stop();
      frameRuns.current = [];
      fillRun.current?.stop();
      fillRun.current = null;
      window.clearTimeout(holdTimer.current);
      holdRelease.current?.();
      holdRelease.current = null;
    },
    [],
  );

  const releaseHold = () => {
    window.clearTimeout(holdTimer.current);
    holdRelease.current?.();
    holdRelease.current = null;
    if (!holdFired.current && !gate.current.held) return;
    holdFired.current = false;
    gate.current.held = false;
    animate(chrome, 1, { duration: durations.fast, ease: easings.enter });
    syncFill();
  };

  const startHold = () => {
    window.clearTimeout(holdTimer.current);
    holdFired.current = false;
    holdTimer.current = window.setTimeout(() => {
      holdFired.current = true;
      gate.current.held = true;
      syncFill();
      animate(chrome, 0, { duration: durations.fast, ease: easings.exit });
      // Capture is only taken once a press travels, so a still press that
      // is let go somewhere else is heard from the window.
      const up = () => {
        if (holdFired.current) releaseHold();
      };
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      window.addEventListener("blur", up);
      holdRelease.current = () => {
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        window.removeEventListener("blur", up);
      };
    }, HOLD_MS);
  };

  const cancelGesture = () => {
    const g = gesture.current;
    if (!g.mode) return;
    const mode = g.mode;
    g.mode = null;
    gate.current.dragging = false;
    hintNext.set(0);
    hintPrev.set(0);
    if (mode === "turn") runTurn(personIndex);
    else if (mode === "close") settleFrame();
    syncFill();
  };

  const drag = useDrag({
    threshold: 6,
    disabled: disabled || !isOpen,
    onStart: ({ offset }) => {
      window.clearTimeout(holdTimer.current);
      const el = viewerRef.current;
      const horizontal = Math.abs(offset.x) >= Math.abs(offset.y);
      gesture.current = {
        mode: horizontal ? "turn" : offset.y > 0 ? "close" : "none",
        start: pos.get(),
        raw: pos.get(),
        w: Math.max(1, el?.offsetWidth ?? 1),
        h: Math.max(1, el?.offsetHeight ?? 1),
      };
      gate.current.dragging = true;
      if (gesture.current.mode === "turn") {
        turnRun.current?.stop();
        turnRun.current = null;
      } else if (gesture.current.mode === "close") {
        stopFrame();
      }
      syncFill();
    },
    onMove: ({ offset }) => {
      const g = gesture.current;
      if (g.mode === "turn") {
        const lo = Math.max(0, personIndex - 1);
        const hi = Math.min(n - 1, personIndex + 1);
        g.raw = rubberClamp(g.start - offset.x / g.w, lo, hi, 0.5);
        if (motionSafe) {
          pos.set(Number(g.raw.toFixed(4)));
        } else {
          // Nothing rotates: the chip naming who is next says it instead.
          const k = r3(clamp01(Math.abs(g.raw - personIndex) * 2));
          const forward = g.raw > personIndex;
          hintNext.set(forward && personIndex < n - 1 ? k : 0);
          hintPrev.set(!forward && personIndex > 0 ? k : 0);
        }
      } else if (g.mode === "close") {
        const dy = offset.y >= 0 ? offset.y : rubberband(offset.y, 60);
        const k = clamp01(dy / g.h);
        g.raw = dy;
        if (motionSafe) {
          vx.set(r2(offset.x));
          vy.set(r2(dy));
          vs.set(r3(1 - SHRINK * k));
          morph.set(r3(k * 0.3));
        } else {
          vo.set(r3(1 - 0.6 * k));
        }
      }
    },
    onEnd: ({ velocity }) => {
      const g = gesture.current;
      const mode = g.mode;
      g.mode = null;
      gate.current.dragging = false;
      if (mode === "turn") {
        hintNext.set(0);
        hintPrev.set(0);
        const speed = -velocity.x / g.w;
        const landing = project(g.raw, speed, 0.99);
        const target = clamp(
          Math.round(landing),
          Math.max(0, personIndex - 1),
          Math.min(n - 1, personIndex + 1),
        );
        if (target !== personIndex) {
          turnTo(target, "swipe", speed);
          // Controlled: held where the host has it until it answers.
          if (value !== undefined) runTurn(personIndex, speed);
        } else {
          runTurn(personIndex, speed);
        }
      } else if (mode === "close") {
        const landing = project(g.raw, velocity.y, 0.99);
        if (landing > g.h * CLOSE_AT) closeViewer("swipe", velocity);
        else settleFrame(velocity);
      }
      syncFill();
    },
    onCancel: () => cancelGesture(),
    onTap: (event) => {
      if (holdFired.current) {
        releaseHold();
        return;
      }
      window.clearTimeout(holdTimer.current);
      const el = viewerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const t = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 1;
      const pan = panFrom(event.clientX, el);
      if (t < BACK_ZONE) back("tap", pan);
      else advance("tap", pan);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !isOpen) return;
    const k = event.key;
    if (k === "Escape") {
      event.preventDefault();
      if (gesture.current.mode) cancelGesture();
      else closeViewer("key");
      return;
    }
    const page = k === "PageDown" || k === "PageUp";
    if (k === "ArrowRight" || k === "ArrowLeft" || page) {
      event.preventDefault();
      const forward = k === "ArrowRight" || k === "PageDown";
      if (page || event.shiftKey) turnBy(forward ? 1 : -1);
      else if (forward) advance("key");
      else back("key");
      return;
    }
    // Space on the viewer itself; on a button it is that button's press.
    if (k === " " && event.target === event.currentTarget) {
      event.preventDefault();
      if (!event.repeat) togglePause();
    }
  };

  const faces = present
    ? [personIndex - 1, personIndex, personIndex + 1].filter(
        (i) => i >= 0 && i < n,
      )
    : [];
  const nextName = people[personIndex + 1]?.name;
  const prevName = people[personIndex - 1]?.name;

  return (
    <div
      ref={setRoot}
      className={cn(
        "@container relative isolate aspect-[9/16] w-full overflow-clip rounded-4 border border-hairline bg-surface-0 [contain:paint]",
        disabled && "opacity-60",
        className,
      )}
    >
      <div inert={isOpen} className="absolute inset-0 flex flex-col">
        <p className="shrink-0 px-3 pt-3 pb-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </p>
        <ul
          aria-label={label}
          className="flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto px-3 py-1.5"
        >
          {people.map((p, i) => {
            const total = p.stories.length;
            const fresh = Math.max(0, total - 1 - (track.reached[p.id] ?? -1));
            return (
              <li
                key={p.id}
                className="flex w-[52px] shrink-0 flex-col items-center gap-1.5"
              >
                <button
                  ref={(node) => {
                    if (node) trayRefs.current.set(p.id, node);
                    else trayRefs.current.delete(p.id);
                  }}
                  type="button"
                  disabled={disabled || total === 0}
                  aria-label={`${p.name}, ${total} ${total === 1 ? "story" : "stories"}, ${fresh > 0 ? `${fresh} new` : "all seen"}`}
                  onClick={() => openAt(p)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-full text-xs font-semibold text-white ring-offset-2 ring-offset-surface-0 outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
                    "cursor-pointer disabled:cursor-not-allowed",
                    fresh > 0
                      ? "ring-2 ring-cobalt-bright"
                      : "ring-1 ring-hairline-strong",
                  )}
                  style={{ background: avatarFill(toneOf(i)) }}
                >
                  {initialsOf(p.name)}
                </button>
                <span
                  className="w-full truncate text-center text-[10px] text-ink-2"
                  title={p.name}
                >
                  {p.name}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="relative flex-1 border-t border-hairline">
          <div className="absolute inset-0 overflow-clip">{children}</div>
        </div>
      </div>

      <motion.div
        ref={viewerRef}
        role="group"
        aria-roledescription="story viewer"
        aria-label={person ? `${person.name}'s stories` : label}
        aria-describedby={hintId}
        tabIndex={disabled ? -1 : 0}
        hidden={!present}
        inert={!isOpen}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("[data-story-control]")
          ) {
            return;
          }
          drag.onPointerDown(event);
          if (disabled || !isOpen) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          startHold();
        }}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={(event) => {
          drag.onPointerCancel(event);
          releaseHold();
        }}
        onLostPointerCapture={drag.onLostPointerCapture}
        className={cn(
          "absolute inset-0 z-10 cursor-pointer overflow-clip bg-black outline-none select-none [-webkit-touch-callout:none]",
          // Sideways and downward drags are the viewer's; a finger moving up
          // still scrolls the page where the browser can say so.
          "touch-none supports-[touch-action:pan-down]:touch-pan-down",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ x: vx, y: vy, scale: vs, opacity: vo, clipPath }}
      >
        <div
          className="absolute inset-0"
          style={{ perspective: `${perspective}cqw` }}
        >
          <motion.div
            className="absolute inset-0 transform-3d"
            style={{ transform: cube }}
          >
            {faces.map((i) => {
              const p = people[i];
              if (!p) return null;
              const live = i === personIndex;
              return (
                <Face
                  key={p.id}
                  person={p}
                  index={i}
                  story={live ? storyIndex : resumeOf(p)}
                  live={live}
                  pos={pos}
                  fill={fill}
                  chrome={chrome}
                  shadeMax={shadeMax}
                  bars={bars}
                  autoplay={autoplay}
                  controls={
                    live ? (
                      <>
                        <button
                          type="button"
                          data-story-control=""
                          aria-label={paused ? "Play" : "Pause"}
                          disabled={disabled}
                          onClick={togglePause}
                          className={iconButton}
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            className="size-4 fill-current"
                          >
                            {paused ? (
                              <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" />
                            ) : (
                              <>
                                <rect
                                  x={4}
                                  y={3}
                                  width={2.6}
                                  height={10}
                                  rx={1}
                                />
                                <rect
                                  x={9.4}
                                  y={3}
                                  width={2.6}
                                  height={10}
                                  rx={1}
                                />
                              </>
                            )}
                          </svg>
                        </button>
                        <button
                          type="button"
                          data-story-control=""
                          aria-label="Close stories"
                          disabled={disabled}
                          onClick={() => closeViewer("key")}
                          className={iconButton}
                        >
                          <svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            className="size-4 fill-none stroke-current"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                          >
                            <path d="M4 4l8 8M12 4l-8 8" />
                          </svg>
                        </button>
                      </>
                    ) : null
                  }
                />
              );
            })}
          </motion.div>
        </div>

        {/* The tap zones, for assistive technology. A pointer passes through
            them to the viewer, which takes the focus a press gives and hears
            the tap through the drag; a press with no pointer behind it
            (detail 0) is a screen reader's. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Previous story"
          disabled={disabled}
          onClick={(event) => {
            if (event.detail === 0) back("key");
          }}
          className="pointer-events-none absolute top-14 bottom-0 left-0 w-[30%] outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Next story"
          disabled={disabled}
          onClick={(event) => {
            if (event.detail === 0) advance("key");
          }}
          className="pointer-events-none absolute top-14 right-0 bottom-0 w-[70%] outline-none"
        />

        {motionSafe ? null : (
          <>
            {nextName ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white"
                style={{ opacity: hintNext }}
              >
                Next · {nextName}
              </motion.span>
            ) : null}
            {prevName ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white"
                style={{ opacity: hintPrev }}
              >
                Previous · {prevName}
              </motion.span>
            ) : null}
          </>
        )}
      </motion.div>

      <p id={hintId} className="sr-only">
        Tap the right of the picture for the next story and the left for the
        previous one, and hold to pause. Swipe sideways to turn to another
        person and down to close. Left and Right step through stories, Shift
        with Left or Right turns to the previous or next person, Space pauses
        and Escape closes.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {said && said.at === stateKey ? said.text : ""}
      </p>
    </div>
  );
}
