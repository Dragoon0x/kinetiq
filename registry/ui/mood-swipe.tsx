"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MoodSwipeFace = "filled" | "line" | "duo";
export type MoodSwipeColour = "mood" | "accent" | "ink";

export type MoodSwipeProps = {
  /** The question being answered. The slider's accessible name. */
  label: string;
  /** Controlled mood, 0 (frown) to 1 (grin). */
  value?: number;
  /** Starting mood when uncontrolled. @default 0.5 */
  defaultValue?: number;
  /** Fires from the swipe, tap or key that changed it, with the new mood. */
  onValueChange?: (value: number) => void;
  /** How many detents from frown to grin, 2 to 9. @default 5 */
  stops?: number;
  /** A word for each stop, frown first. Used when there is one per stop. */
  labels?: readonly string[];
  /** A solid tinted disc, an outline, or a tinted wash with outline features. @default "filled" */
  face?: MoodSwipeFace;
  /** The tint: travels from danger through warn to success with the mood, or stays accent or ink. @default "mood" */
  colour?: MoodSwipeColour;
  /** Land on stops. Off, the face rests wherever it is let go. @default true */
  snap?: boolean;
  /** A pitch glide while the face moves and a note at each stop. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The face's box, in px. The drawing is in a 100-unit viewBox. */
const FACE = 112;
/** The rail from the first stop to the last, in px: one unit of mood. */
const RAIL = 168;
/** Room each side of the rail for the rider to rubber-band into. */
const PAD = 24;
/** How far past either end a pull can take the mood, at most. */
const RUBBER = 0.15;
/** Fraction of speed kept per ms when a swipe is thrown: a face is heavy. */
const THROW = 0.99;
/** A key's step without snap: fine enough to reach any score in a few presses. */
const FINE = 0.05;
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12] as const;

const WORDS: Record<number, readonly string[]> = {
  2: ["Unhappy", "Happy"],
  3: ["Unhappy", "Okay", "Happy"],
  5: ["Awful", "Poor", "Okay", "Good", "Great"],
  7: ["Awful", "Bad", "Poor", "Okay", "Good", "Great", "Superb"],
};
const LADDER = [
  "Awful",
  "Bad",
  "Poor",
  "Meh",
  "Okay",
  "Fine",
  "Good",
  "Great",
  "Superb",
] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r6 = (v: number) => Number(v.toFixed(6));
const smooth = (t: number) => t * t * (3 - 2 * t);
const pt = (x: number, y: number) => `${r2(x)} ${r2(y)}`;

const quantize = (v: number, n: number) =>
  r6(Math.round(clamp01(v) * (n - 1)) / (n - 1));

/** The next stop past `v` in a direction, even from between two stops. */
const nextStop = (v: number, dir: 1 | -1, n: number) => {
  const k = clamp01(v) * (n - 1);
  const to = dir > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1;
  return r6(clamp(to, 0, n - 1) / (n - 1));
};

function wordsFor(n: number, labels?: readonly string[]): readonly string[] {
  if (labels && labels.length === n) return labels;
  const set = WORDS[n];
  if (set) return set;
  return Array.from(
    { length: n },
    (_, k) => LADDER[Math.round((k * 8) / (n - 1))] ?? "Okay",
  );
}

/** A stop's note: a major scale across one octave, frown lowest. */
const noteFor = (k: number, n: number) =>
  semitones((MAJOR[Math.round((k * 7) / (n - 1))] ?? 0) - 5);

/*
 * The face. `s` runs from -1 (frown) through 0 to 1 (grin), a little past
 * either end while a pull rubber-bands. Every feature is rebuilt from it with
 * the same command list every frame — mouth and eyes `M C C Z`, brows `M C` —
 * so the morph is an interpolation of numbers, never a swap of shapes. A
 * cubic whose two handles sit at height h bows by 0.75h, so each handle is
 * placed from the point the curve should pass through.
 */

function mouthPath(s: number): string {
  const grin = Math.max(0, s);
  const half = 14 + 3 * s;
  const corner = 66 - 5 * s;
  const upper = 66 + 3 * s;
  // Only a grin opens: the lower lip drops away from the upper.
  const lower = upper + 11 * grin * (0.55 + 0.45 * grin);
  const handle = (mid: number) => (mid - 0.25 * corner) / 0.75;
  const hu = handle(upper);
  const hl = handle(lower);
  const reach = half * 0.55;
  return [
    `M ${pt(50 - half, corner)}`,
    `C ${pt(50 - reach, hu)} ${pt(50 + reach, hu)} ${pt(50 + half, corner)}`,
    `C ${pt(50 + reach, hl)} ${pt(50 - reach, hl)} ${pt(50 - half, corner)}`,
    "Z",
  ].join(" ");
}

/** `side` is where the outer corner is: -1 for the left eye. */
function eyePath(s: number, cx: number, side: 1 | -1): string {
  const grin = clamp(s, 0, 1.2);
  const frown = clamp(-s, 0, 1.2);
  const reach = 4.6;
  const cy = 42 - 2.2 * grin;
  // Sad eyes droop: the inner corner lifts, the outer sinks, the lid flattens.
  const tilt = 2.6 * frown;
  const ix = cx - side * reach;
  const ox = cx + side * reach;
  const iy = cy - tilt;
  const oy = cy + tilt;
  const top = (4 / 3) * 4.6 * (1 - 0.5 * frown);
  // Happy eyes squint: the lower lid rises past the corners into a crescent.
  const bottom = (4 / 3) * (4.6 - 6.8 * grin);
  return [
    `M ${pt(ix, iy)}`,
    `C ${pt(ix, iy - top)} ${pt(ox, oy - top)} ${pt(ox, oy)}`,
    `C ${pt(ox, oy + bottom)} ${pt(ix, iy + bottom)} ${pt(ix, iy)}`,
    "Z",
  ].join(" ");
}

function browPath(s: number, cx: number, side: 1 | -1): string {
  const grin = clamp(s, 0, 1.2);
  const frown = clamp(-s, 0, 1.2);
  const y = 29.5 - 2 * grin;
  const ix = cx - side * 6;
  const ox = cx + side * 5;
  const iy = y - 4.5 * frown + 0.5 * grin;
  const oy = y + 2 * frown;
  const arch = (4 / 3) * (1.2 + 1.3 * grin - 0.6 * frown);
  const dx = ox - ix;
  return `M ${pt(ix, iy)} C ${pt(ix + dx / 3, iy - arch)} ${pt(ix + (2 * dx) / 3, oy - arch)} ${pt(ox, oy)}`;
}

/*
 * The status tokens are set for text, so a light page darkens them, and a
 * whole face in text-safe amber reads as mud. A filled face is pigment, not
 * text: it takes each token's hue and chroma at one lightness in both themes.
 */
const PIGMENT = {
  danger: "oklch(from var(--danger) 0.64 c h)",
  warn: "oklch(from var(--warn) 0.8 c h)",
  success: "oklch(from var(--success) 0.72 c h)",
};
const INK = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  success: "var(--success)",
};

/** The tint at a mood. Between two chromatic tokens, so oklch keeps its hue. */
function tintOf(m: number, colour: MoodSwipeColour, pigment = false): string {
  if (colour === "accent") return "var(--accent-bright)";
  if (colour === "ink") return "var(--ink-2)";
  const c = pigment ? PIGMENT : INK;
  const t = clamp01(m);
  if (t <= 0.5) {
    return `color-mix(in oklch, ${c.warn} ${Math.round(t * 200)}%, ${c.danger})`;
  }
  return `color-mix(in oklch, ${c.success} ${Math.round((t - 0.5) * 200)}%, ${c.warn})`;
}

const BLUSH = "color-mix(in oklab, var(--danger) 62%, white)";

type Paint = {
  head: string;
  cheek: string;
  rim: string;
  rimWidth: number;
  feature: string;
  mouth: string;
};

/*
 * Paint for each face, in terms of `currentColor` (the tint, set per frame on
 * the drawing). Shading mixes toward black in oklab: an oklch mix with black
 * loses the hue on the way. A filled face in ink is a pale disc with ink
 * features, so it reads on a light page as well as a dark one.
 */
function paintOf(face: MoodSwipeFace, colour: MoodSwipeColour): Paint {
  if (face === "line") {
    return {
      head: "transparent",
      cheek: BLUSH,
      rim: "currentColor",
      rimWidth: 3,
      feature: "currentColor",
      mouth: "color-mix(in oklab, currentColor 22%, transparent)",
    };
  }
  if (face === "duo") {
    return {
      head: "color-mix(in oklab, currentColor 20%, transparent)",
      cheek: BLUSH,
      rim: "currentColor",
      rimWidth: 3,
      feature: "currentColor",
      mouth: "color-mix(in oklab, currentColor 42%, transparent)",
    };
  }
  if (colour === "ink") {
    return {
      head: "color-mix(in oklab, var(--ink-3) 28%, var(--bg-2))",
      cheek: BLUSH,
      rim: "var(--hairline-strong)",
      rimWidth: 1.5,
      feature: "var(--ink)",
      mouth: "var(--ink)",
    };
  }
  const dark = "color-mix(in oklab, currentColor 26%, black)";
  // On a solid tinted face a rosy blush muddies; a lighter tint lifts instead.
  return {
    head: "currentColor",
    cheek: "color-mix(in oklab, currentColor 48%, white)",
    rim: "color-mix(in oklab, currentColor 80%, black)",
    rimWidth: 1.5,
    feature: dark,
    mouth: dark,
  };
}

type Said = { text: string; value: number };

/**
 * A satisfaction input drawn as one face. Swiped across, the face morphs
 * continuously from a frown to a grin — the mouth bends and opens, the eyes
 * go from drooping half-moons through dots to squinting crescents, the brows
 * lift and the cheeks rise and blush — under the finger 1:1, rubber-banding
 * past either end into a deeper frown or a wider grin. Let go and the throw
 * is projected: with `snap`, the face lands on the nearest stop on the snap
 * spring with the release velocity (one crisp overshoot); without it, it
 * coasts on the glide spring and rests where it stops. The head leans into
 * the swipe and rights itself as it lands.
 *
 * Every feature is a path whose command list never changes, rebuilt each
 * frame from one motion value, so the morph is a real interpolation. It is a
 * `role="slider"`: arrow keys step a stop (5% without `snap`), Page keys
 * jump, Home and End reach frown and grin, with the same flight and sound as
 * a swipe. Sound is a hum that glides an octave with the mood while the face
 * moves, and a note on a rising scale at each stop. Under reduced motion the
 * face still follows the finger, but a release or a key sets it in one step,
 * with no lean and no glide, while the note, the word and the value still
 * change, because the reading is information.
 */
export function MoodSwipe({
  label,
  value,
  defaultValue = 0.5,
  onValueChange,
  stops = 5,
  labels,
  face = "filled",
  colour = "mood",
  snap = true,
  sound = false,
  disabled = false,
  className,
}: MoodSwipeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const n = Math.round(clamp(Number.isFinite(stops) ? stops : 5, 2, 9));
  const words = wordsFor(n, labels);

  const [own, setOwn] = React.useState(() => clamp01(defaultValue));
  const raw = clamp01(value ?? own);
  // With snap on, a value between stops is shown (and read) at its nearest.
  const current = snap ? quantize(raw, n) : r6(raw);
  const index = Math.round(current * (n - 1));
  const word = words[index] ?? "";
  const reading = snap
    ? `${word}, ${index + 1} of ${n}`
    : `${word}, ${Math.round(current * 100)} percent`;

  const [said, setSaid] = React.useState<Said | null>(null);
  // A release that keeps the value still needs a render to fly home from.
  const [, setReleased] = React.useState(0);
  const [grabbing, setGrabbing] = React.useState(false);
  // The word under the face follows it while it moves: a reading, so it
  // changes a few times a swipe, never per frame.
  const [nearest, setNearest] = React.useState({ k: index, n });
  const wordAt = nearest.n === n ? nearest.k : index;

  const mood = useMotionValue(current);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const faceRef = React.useRef<SVGSVGElement | null>(null);
  const flight = React.useRef<AnimationPlaybackControls | null>(null);
  const glide = React.useRef<LoopHandle | null>(null);
  const shown = React.useRef(current);
  const launch = React.useRef<{ velocity: number } | null>(null);
  const dragging = React.useRef(false);
  const from = React.useRef(0);
  const detach = React.useRef<(() => void) | null>(null);
  // Only a swipe, a tap or a key is heard; a host moving the face is silent.
  const audible = React.useRef(false);
  const sounded = React.useRef<number | null>(index);

  const latest = React.useRef({ n, audio, motionSafe });
  React.useEffect(() => {
    latest.current = { n, audio, motionSafe };
  });

  const stopGlide = React.useCallback(() => {
    glide.current?.stop();
    glide.current = null;
  }, []);

  const startGlide = () => {
    if (!motionSafe || glide.current) return;
    glide.current = audio.start("hum", {
      pitch: r2(1.5 * Math.pow(2, clamp(mood.get(), -0.2, 1.2))),
      gain: 0.55,
    });
  };

  const fly = (target: number, velocity: number) => {
    flight.current?.stop();
    if (!motionSafe) {
      mood.set(target);
      stopGlide();
      return;
    }
    // Nothing to travel, nothing to hear: a key at the end of the range
    // would otherwise blip the hum on and straight off.
    if (audible.current && Math.abs(target - mood.get()) > 0.01) startGlide();
    flight.current = animate(mood, target, {
      ...(snap ? springs.snap : springs.glide),
      velocity,
      onComplete: stopGlide,
    });
  };

  // The flight. It looks at every commit and acts when the value moved or a
  // release is waiting; a release the host did not take flies back the same
  // way. A host change mid-drag waits for the release.
  React.useLayoutEffect(() => {
    const moved = shown.current !== current;
    const thrown = launch.current;
    launch.current = null;
    shown.current = current;
    if ((!moved && !thrown) || dragging.current) return;
    audible.current = thrown !== null;
    fly(current, thrown?.velocity ?? 0);
  });

  // Stops are heard from the face itself, on the frame it reaches each one,
  // whatever moved it there. A stop re-arms only once the face has moved half
  // a stop away, so a landing's overshoot does not ring it twice.
  React.useEffect(() => {
    const unsubscribe = mood.on("change", (m) => {
      const now = latest.current;
      const spacing = 1 / (now.n - 1);
      glide.current?.set({
        pitch: r2(1.5 * Math.pow(2, clamp(m, -0.2, 1.2))),
      });
      const last = sounded.current;
      if (last !== null && Math.abs(m - last * spacing) > spacing / 2) {
        sounded.current = null;
      }
      const k = Math.round(clamp01(m) / spacing);
      setNearest((prev) =>
        prev.k === k && prev.n === now.n ? prev : { k, n: now.n },
      );
      if (Math.abs(m - k * spacing) > spacing * 0.12 || sounded.current === k) {
        return;
      }
      sounded.current = k;
      if (!audible.current) return;
      const rail = railRef.current?.getBoundingClientRect();
      now.audio.play("note", {
        pitch: r2(noteFor(k, now.n)),
        gain: 0.42,
        pan: rail ? panFrom(rail.left + k * spacing * rail.width, null) : 0,
      });
    });
    return unsubscribe;
  }, [mood]);

  React.useEffect(
    () => () => {
      flight.current?.stop();
      detach.current?.();
      detach.current = null;
    },
    [],
  );

  const commit = (next: number, velocity: number, via: "pointer" | "key") => {
    launch.current = { velocity };
    setReleased((c) => c + 1);
    if (next === current) return;
    if (value === undefined) setOwn(next);
    // Keys are spoken by the slider itself; only a pointer change is said.
    if (via === "pointer") setSaid({ text: sentence(next), value: next });
    else setSaid(null);
    onValueChange?.(next);
  };

  function sentence(next: number): string {
    const k = Math.round(next * (n - 1));
    const w = words[k] ?? "";
    return snap
      ? `${w}, ${k + 1} of ${n}.`
      : `${w}, ${Math.round(next * 100)} percent.`;
  }

  const endDrag = () => {
    dragging.current = false;
    detach.current?.();
    detach.current = null;
    setGrabbing(false);
  };

  const drag = useDrag({
    axis: "x",
    disabled,
    onStart: () => {
      flight.current?.stop();
      dragging.current = true;
      audible.current = true;
      from.current = mood.get();
      setGrabbing(true);
      startGlide();
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cancel();
      };
      document.addEventListener("keydown", onKey);
      detach.current = () => document.removeEventListener("keydown", onKey);
    },
    onMove: ({ offset }) => {
      if (!dragging.current) return;
      const m = rubberClamp(from.current + offset.x / RAIL, 0, 1, RUBBER);
      mood.set(Number(m.toFixed(4)));
    },
    onEnd: ({ velocity }) => {
      if (!dragging.current) return;
      endDrag();
      const v = velocity.x / RAIL;
      const landing = clamp01(project(mood.get(), v, THROW));
      commit(snap ? quantize(landing, n) : r2(landing), v, "pointer");
    },
    onCancel: () => cancel(),
    onTap: (event) => {
      audible.current = true;
      const rail = railRef.current?.getBoundingClientRect();
      if (
        rail &&
        event.clientY >= rail.top - 8 &&
        event.clientY <= rail.bottom + 8
      ) {
        commit(
          quantize((event.clientX - rail.left) / rail.width, n),
          0,
          "pointer",
        );
        return;
      }
      const box = faceRef.current?.getBoundingClientRect();
      if (!box || event.clientY < box.top || event.clientY > box.bottom) return;
      const dir = event.clientX < box.left + box.width / 2 ? -1 : 1;
      commit(nextStop(current, dir, n), 0, "pointer");
    },
  });

  function cancel() {
    if (!dragging.current) return;
    endDrag();
    launch.current = { velocity: 0 };
    setReleased((c) => c + 1);
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = snap ? nextStop(current, 1, n) : r2(clamp01(current + FINE));
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = snap ? nextStop(current, -1, n) : r2(clamp01(current - FINE));
        break;
      case "PageUp":
        next = nextStop(current, 1, n);
        if (snap) next = nextStop(next, 1, n);
        break;
      case "PageDown":
        next = nextStop(current, -1, n);
        if (snap) next = nextStop(next, -1, n);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
    }
    if (next === null) return;
    event.preventDefault();
    if (dragging.current) return;
    audible.current = true;
    commit(next, 0, "key");
  };

  // Everything below is drawn from the one number.
  const s = useTransform(mood, (m) => m * 2 - 1);
  const tint = useTransform(mood, (m) => tintOf(m, colour));
  const pigment = useTransform(mood, (m) =>
    tintOf(m, colour, face === "filled"),
  );
  const mouth = useTransform(s, mouthPath);
  const eyeL = useTransform(s, (v) => eyePath(v, 35, -1));
  const eyeR = useTransform(s, (v) => eyePath(v, 65, 1));
  const browL = useTransform(s, (v) => browPath(v, 35, -1));
  const browR = useTransform(s, (v) => browPath(v, 65, 1));
  // Brows carry the worry; a grin says it with the eyes, so they fade.
  const browOpacity = useTransform(s, (v) =>
    r2(clamp01(0.3 + 0.7 * smooth(clamp01(-v)) - 0.15 * clamp01(v))),
  );
  const headRx = useTransform(s, (v) => r2(44 + 1.5 * v));
  const headRy = useTransform(s, (v) => r2(44 - 1.2 * v));
  const cheekY = useTransform(s, (v) => r2(63 - 3 * clamp(v, 0, 1.2)));
  const cheekRx = useTransform(s, (v) => r2(7 + clamp(v, 0, 1.2)));
  const cheekOpacity = useTransform(s, (v) => r2(0.6 * smooth(clamp01(v))));
  const riderX = useTransform(mood, (m) => r2(m * RAIL));
  // The head leans into the swipe, and rights itself as it slows.
  const speed = useVelocity(mood);
  const lean = useTransform(speed, (v) =>
    motionSafe ? r2(clamp(v * 2.4, -7, 7)) : 0,
  );
  const spacing = 1 / (n - 1);

  const paint = paintOf(face, colour);
  const stroke = {
    stroke: paint.feature,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(current * 100)}
        aria-valuetext={reading}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        onLostPointerCapture={(event) => {
          // A touch is implicitly captured by the drawing it lands on; when
          // the drag takes the capture for the slider, that child's loss
          // bubbles up here. Only the slider's own loss ends the drag.
          if (event.target === event.currentTarget) {
            drag.onLostPointerCapture(event);
          }
        }}
        className={cn(
          "flex touch-pan-y flex-col items-center gap-2 rounded-4 pt-1 pb-1.5 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed opacity-50"
            : grabbing
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
        style={{ paddingInline: PAD }}
      >
        <motion.svg
          ref={faceRef}
          aria-hidden
          width={FACE}
          height={FACE}
          viewBox="0 0 100 100"
          className="block shrink-0"
          style={{ color: pigment, rotate: lean }}
        >
          <motion.ellipse
            cx={50}
            cy={50}
            rx={headRx}
            ry={headRy}
            strokeWidth={paint.rimWidth}
            style={{ fill: paint.head, stroke: paint.rim }}
          />
          <motion.ellipse
            cx={23}
            cy={cheekY}
            rx={cheekRx}
            ry={4.4}
            style={{ fill: paint.cheek, opacity: cheekOpacity }}
          />
          <motion.ellipse
            cx={77}
            cy={cheekY}
            rx={cheekRx}
            ry={4.4}
            style={{ fill: paint.cheek, opacity: cheekOpacity }}
          />
          <motion.g style={{ opacity: browOpacity }}>
            <motion.path
              d={browL}
              fill="none"
              strokeWidth={2.6}
              style={stroke}
            />
            <motion.path
              d={browR}
              fill="none"
              strokeWidth={2.6}
              style={stroke}
            />
          </motion.g>
          <motion.path
            d={eyeL}
            strokeWidth={2.4}
            style={{ ...stroke, fill: paint.feature }}
          />
          <motion.path
            d={eyeR}
            strokeWidth={2.4}
            style={{ ...stroke, fill: paint.feature }}
          />
          <motion.path
            d={mouth}
            strokeWidth={3.4}
            style={{ ...stroke, fill: paint.mouth }}
          />
        </motion.svg>

        <div
          ref={railRef}
          aria-hidden
          className="relative h-5 shrink-0"
          style={{ width: RAIL }}
        >
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline-strong" />
          {words.map((w, k) => {
            const size = snap ? 6 : 4;
            return (
              <span
                key={`${k}-${w}`}
                className="absolute top-1/2 rounded-full"
                style={{
                  left: r2(k * spacing * RAIL - size / 2),
                  width: size,
                  height: size,
                  marginTop: -size / 2,
                  background:
                    colour === "mood"
                      ? tintOf(k * spacing, "mood")
                      : "var(--ink-3)",
                }}
              />
            );
          })}
          <motion.span
            className="absolute top-1/2 left-0 -mt-[7px] -ml-[7px] size-3.5 rounded-full border-2 border-card shadow-sm"
            style={{ x: riderX, color: tint, background: "currentColor" }}
          />
        </div>

        <div aria-hidden className="grid h-5 shrink-0 place-items-center">
          {words.map((w, k) => (
            <Word key={`${k}-${w}`} shown={k === wordAt}>
              {w}
            </Word>
          ))}
        </div>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {said && said.value === current ? said.text : ""}
      </span>
    </div>
  );
}

/**
 * One stop's word. All of them share one grid cell, so the caption is as wide
 * as the longest word and never shifts; the nearest one is shown.
 */
function Word({
  shown,
  children,
}: {
  shown: boolean;
  children: React.ReactNode;
}) {
  return (
    <motion.span
      className="col-start-1 row-start-1 text-sm leading-5 font-medium whitespace-nowrap text-foreground"
      initial={false}
      animate={{ opacity: shown ? 1 : 0 }}
      transition={{ duration: durations.fast, ease: easings.enter }}
    >
      {children}
    </motion.span>
  );
}
