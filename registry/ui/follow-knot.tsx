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
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FollowKnotSize = "sm" | "md" | "lg";

export type FollowKnotProps = {
  /** Controlled: whether the viewer follows. */
  pressed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press that changed it, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** The word before following, and the start of the accessible name. @default "Follow" */
  label?: string;
  /** The word once following. @default "Following" */
  pressedLabel?: string;
  /** The word while a followed button is hovered or keyboard-focused: what a press will do. @default "Unfollow" */
  releaseLabel?: string;
  /** Who or what is followed, appended to the accessible name ("Follow Fieldline Journal"). */
  target?: string;
  /** Followers without this viewer; the button adds one while followed. Omit to hide the figure. */
  count?: number;
  /** How the figure is written. @default en-US grouping, "1,300" */
  formatCount?: (count: number) => string;
  /** The figure as spoken, read as the button's description. @default "1,300 followers" */
  describeCount?: (count: number) => string;
  /** How hard the knot is pulled, 0 to 1: a loose eye that settles softly, or a hard bead that snaps past tight. @default 0.5 */
  tension?: number;
  /** How far the knot turns as it loosens under a hover, in degrees. @default 8 */
  untieAngle?: number;
  /** How long the free end takes to sweep its loop, in ms; the knot starts to cinch 60% of the way in. @default 240 */
  tieDuration?: number;
  /** How long a pointer rests on a followed button before it offers to unfollow, in ms. @default 80 */
  previewDelay?: number;
  /** Icon only: the knot alone in a round button, the words in its accessible name. @default false */
  compact?: boolean;
  /** @default "md" */
  size?: FollowKnotSize;
  /** The unfollowed pill's fill, any CSS colour. @default "var(--accent)" */
  accent?: string;
  /** Words and rope on that fill. @default "var(--primary-foreground)" */
  accentInk?: string;
  /** Ink of the unfollow preview. @default "var(--danger)" */
  danger?: string;
  /** Play the rope's tick and the knot's snap. Off unless asked for. @default false */
  sound?: boolean;
  /** Not pressable, and drawn at half strength. @default false */
  disabled?: boolean;
  /** Classes for the button. */
  className?: string;
};

type Pt = readonly [number, number];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (p: Pt, q: Pt, t: number): Pt => [
  lerp(p[0], q[0], t),
  lerp(p[1], q[1], t),
];
const unit = (x: number, y: number): Pt => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

/*
 * The rope. Every pose is the same 49 points spaced evenly along its length,
 * so a pose is a list of numbers and two poses blend point by point. The
 * standing end is point 0; the free end is the last point, and everything
 * from SPLIT on is drawn over the rest with a halo in the pill's own colour,
 * which is what makes a crossing read as over-and-under rather than as a
 * blot.
 */
const N = 49;
const SPLIT = 34;
/** The halo starts a little after the split, so it never notches the fold it leaves from. */
const HALO_FROM = 36;
const ROPE = 2.1;
const HALO = ROPE + 1.5;

function resample(pts: readonly Pt[]): Pt[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    cum.push(
      (cum[i - 1] ?? 0) + (a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 0),
    );
  }
  const total = cum[cum.length - 1] ?? 0;
  const out: Pt[] = [];
  let j = 1;
  for (let i = 0; i < N; i += 1) {
    const d = (total * i) / (N - 1);
    while (j < pts.length - 1 && (cum[j] ?? 0) < d) j += 1;
    const a = pts[j - 1] ?? pts[0] ?? [0, 0];
    const b = pts[j] ?? a;
    const start = cum[j - 1] ?? 0;
    const seg = (cum[j] ?? start) - start || 1;
    out.push(mix(a, b, clamp01((d - start) / seg)));
  }
  return out;
}

const straight = (a: Pt, b: Pt, steps: number): Pt[] =>
  Array.from({ length: steps }, (_, i) => mix(a, b, (i + 1) / steps));

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    ]);
  }
  return out;
}

/**
 * The loop the free end throws: it leaves V the way the rope was heading,
 * swings round a far point on the bisector and comes back through V the way
 * the free end will leave, crossing the standing part there.
 */
function loop(v: Pt, din: Pt, dout: Pt, r: number): Pt[] {
  const bis = unit(din[0] - dout[0], din[1] - dout[1]);
  const far: Pt = [v[0] + bis[0] * r * 2.25, v[1] + bis[1] * r * 2.25];
  const side: Pt = [-bis[1], bis[0]];
  const s = Math.sign(din[0] * side[0] + din[1] * side[1]) || 1;
  const h = r * 1.1;
  const w = r * 1.05 * s;
  return [
    ...cubic(
      v,
      [v[0] + din[0] * h, v[1] + din[1] * h],
      [far[0] + side[0] * w, far[1] + side[1] * w],
      far,
      14,
    ),
    ...cubic(
      far,
      [far[0] - side[0] * w, far[1] - side[1] * w],
      [v[0] - dout[0] * h, v[1] - dout[1] * h],
      v,
      14,
    ),
  ];
}

type Knot = { s: Pt; v: Pt; f: Pt; r: number };

/** The plus: down the upright, back up to the centre, out along the bar and back across it. */
const PLUS = resample([
  [12, 5],
  [12, 19],
  [12, 12],
  [19, 12],
  [5, 12],
]);
/** Mid-tie: the standing part has swung toward the check, the loop is wide open. */
const THROWN: Knot = { s: [15, 4.5], v: [11, 13.5], f: [4.5, 10], r: 3.6 };
/** Tied: the long arm, a knot at the vertex, the short arm. Its eye shrinks with tension. */
const tied = (tension: number): Knot => ({
  s: [19, 5.75],
  v: [10, 14.25],
  f: [5, 9.75],
  r: lerp(2.3, 1.2, tension),
});

function knotPoints(c: number, tension: number): Pt[] {
  const end = tied(tension);
  // Past 1 the pose keeps going the way it was going: that is the snap's
  // overshoot, the knot pulled a little past tight before it relaxes.
  const s = mix(THROWN.s, end.s, c);
  const v = mix(THROWN.v, end.v, c);
  const f = mix(THROWN.f, end.f, c);
  const r = Math.max(0.8, lerp(THROWN.r, end.r, c));
  const din = unit(v[0] - s[0], v[1] - s[1]);
  const dout = unit(f[0] - v[0], f[1] - v[1]);
  return resample([
    s,
    ...straight(s, v, 14),
    ...loop(v, din, dout, r),
    ...straight(v, f, 8),
  ]);
}

const toPath = (pts: readonly Pt[]) =>
  pts.length === 0
    ? ""
    : `M${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L")}`;

function rope(tie: number, cinch: number, tension: number) {
  const k = knotPoints(cinch, tension);
  const pts = PLUS.map((p, i) => mix(p, k[i] ?? p, tie));
  return {
    under: toPath(pts.slice(0, SPLIT + 1)),
    over: toPath(pts.slice(SPLIT)),
    halo: toPath(pts.slice(HALO_FROM)),
  };
}

type SizeSpec = {
  box: string;
  square: string;
  glyph: number;
  line: number;
  figure: string;
};

const SIZES: Record<FollowKnotSize, SizeSpec> = {
  sm: {
    box: "h-8 gap-1.5 px-3 text-xs leading-4",
    square: "size-8",
    glyph: 16,
    line: 16,
    figure: "my-1.5 ml-0.5 gap-2 pl-2 text-[11px]",
  },
  md: {
    box: "h-9 gap-2 px-3.5 text-sm leading-5",
    square: "size-9",
    glyph: 18,
    line: 16,
    figure: "my-2 ml-0.5 gap-2 pl-2.5 text-xs",
  },
  lg: {
    box: "h-11 gap-2.5 px-4.5 text-[15px] leading-6",
    square: "size-11",
    glyph: 22,
    line: 20,
    figure: "my-2.5 ml-1 gap-2.5 pl-3 text-sm",
  },
};

/** The pill under everything; the halo is painted in the same colour. */
const BASE = "var(--bg-2)";
/** The rope "rope-first" lead an untie gets before the words and figure follow. */
const UNTIE_LAG = 0.12;
const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const groupFormat = new Intl.NumberFormat("en-US");
const defaultFormat = (n: number) => groupFormat.format(n);
const defaultDescribe = (n: number) =>
  `${groupFormat.format(n)} ${n === 1 ? "follower" : "followers"}`;

/**
 * One column of an odometer: the ten digits and a second 0, so 9 rolls on to
 * 0 the same way it was going and 0 rolls back to 9 from below.
 */
function Digit({
  digit,
  dir,
  delay,
  line,
  motionSafe,
}: {
  digit: number;
  dir: number;
  delay: number;
  line: number;
  motionSafe: boolean;
}) {
  const pos = useMotionValue(digit);
  const state = React.useRef<{
    digit: number;
    run: AnimationPlaybackControls | null;
  }>({ digit, run: null });

  React.useEffect(() => {
    const s = state.current;
    if (s.digit === digit) return;
    s.digit = digit;
    s.run?.stop();
    if (!motionSafe) {
      pos.jump(digit);
      return;
    }
    let from = ((pos.get() % 10) + 10) % 10;
    let to = digit;
    if (dir >= 0 && to < from - 0.001) to += 10;
    if (dir < 0 && to > from + 0.001) from += 10;
    pos.jump(from);
    s.run = animate(pos, to, {
      ...springs.snap,
      delay,
      onComplete: () => pos.jump(digit),
    });
  }, [delay, digit, dir, motionSafe, pos]);

  // Finish, never freeze: an interrupted roll lands on its digit.
  React.useEffect(() => {
    const s = state.current;
    return () => {
      s.run?.stop();
      s.run = null;
      pos.jump(s.digit);
    };
  }, [pos]);

  const y = useTransform(pos, (p) => r2(-p * line));

  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ height: line }}
    >
      <span className="invisible block" style={{ lineHeight: `${line}px` }}>
        0
      </span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        style={{ y }}
      >
        {FACES.map((face, i) => (
          <span
            key={i}
            className="block"
            style={{ height: line, lineHeight: `${line}px` }}
          >
            {face}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Figure({
  value,
  reserve,
  format,
  dir,
  delay,
  line,
  motionSafe,
}: {
  value: number;
  reserve: number[];
  format: (n: number) => string;
  dir: number;
  delay: number;
  line: number;
  motionSafe: boolean;
}) {
  const text = format(value);
  const sizer = reserve
    .map(format)
    .reduce((a, b) => (b.length > a.length ? b : a), text);
  const chars = [...text];
  return (
    <span className="grid">
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1"
        style={{ lineHeight: `${line}px` }}
      >
        {sizer}
      </span>
      <span className="col-start-1 row-start-1 flex justify-self-end">
        {chars.map((ch, i) => {
          // Keyed from the right, so a column keeps its wheel when the
          // figure gains a digit on the left.
          const fromRight = chars.length - 1 - i;
          if (!/\d/.test(ch)) {
            return (
              <span key={`c${fromRight}`} style={{ lineHeight: `${line}px` }}>
                {ch}
              </span>
            );
          }
          // Units first, then each column to the left a beat later: an
          // odometer's small wheels turn before its big ones.
          const order = chars.slice(i + 1).filter((c) => /\d/.test(c)).length;
          return (
            <Digit
              key={`d${fromRight}`}
              digit={Number(ch)}
              dir={dir}
              delay={delay + order * 0.03}
              line={line}
              motionSafe={motionSafe}
            />
          );
        })}
      </span>
    </span>
  );
}

type Api = {
  play: (to: boolean) => void;
  onTie: (v: number) => void;
  onCinch: (v: number) => void;
};

/**
 * A follow button whose plus is one rope. Pressed, the free end of the rope
 * sweeps round into a loop that crosses over the standing part, and the loop
 * cinches into a knot at the vertex of a check — on the snap spring, thrown
 * hard enough by `tension` that its one overshoot shows as the knot pulling
 * past tight. The label slides from Follow to Following inside a cell as wide
 * as the longest word, and the follower figure rolls one on, units first.
 *
 * Hovering or keyboard-focusing a followed button offers the untie: the knot
 * loosens and turns a few degrees and the label reads Unfollow in danger ink.
 * A press then unties it rope-first, and the words and figure follow. The
 * preview never appears under the pointer that just followed.
 *
 * It is a real toggle: a button with `aria-pressed`, a name that does not
 * change with its state, and the figure as its description; Space and Enter
 * press it. Under reduced motion the rope swaps between plus and check with a
 * short fade, the words cross-fade and the digits change in place, because
 * following is information.
 */
export function FollowKnot({
  pressed,
  defaultPressed = false,
  onPressedChange,
  label = "Follow",
  pressedLabel = "Following",
  releaseLabel = "Unfollow",
  target,
  count,
  formatCount = defaultFormat,
  describeCount = defaultDescribe,
  tension = 0.5,
  untieAngle = 8,
  tieDuration = 240,
  previewDelay = 80,
  compact = false,
  size = "md",
  accent = "var(--accent)",
  accentInk = "var(--primary-foreground)",
  danger = "var(--danger)",
  sound = false,
  disabled = false,
  className,
}: FollowKnotProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const countId = `${uid}-count`;
  const g = SIZES[size] ?? SIZES.md;
  const tn = clamp01(tension);
  const tieSeconds = Math.max(0.06, tieDuration / 1000);

  const [own, setOwn] = React.useState(defaultPressed);
  const isPressed = pressed ?? own;
  const [hovering, setHovering] = React.useState(false);
  const [offer, setOffer] = React.useState(false);
  const showPreview = isPressed && offer && !disabled;

  const tie = useMotionValue(isPressed ? 1 : 0);
  const cinch = useMotionValue(isPressed ? 1 : 0);
  const loosen = useMotionValue(0);
  const hint = useMotionValue(0);
  const squeeze = useMotionValue(0);
  const fill = useMotionValue(isPressed ? 0 : 1);
  const wash = useMotionValue(0);
  const ghost = useMotionValue(1);
  const wordY = [useMotionValue(0), useMotionValue(0), useMotionValue(0)];
  const wordOpacity = [
    useMotionValue(isPressed ? 0 : 1),
    useMotionValue(isPressed ? 1 : 0),
    useMotionValue(0),
  ];
  const wordIndex = !isPressed ? 0 : showPreview ? 2 : 1;

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const live = React.useRef({
    shown: isPressed,
    word: wordIndex,
    /** Set by a press: the next tie or untie answers it, and may be heard. */
    voice: null as { follow: boolean; until: number } | null,
    /** After a press, no unfollow offer until the pointer or focus leaves. */
    suppress: false,
    timer: 0,
    lastTie: isPressed ? 1 : 0,
    lastCinch: isPressed ? 1 : 0,
    running: new Map<string, AnimationPlaybackControls>(),
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    const map = live.current.running;
    map.get(key)?.stop();
    map.set(key, controls);
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const voiced = (follow: boolean) => {
    const v = live.current.voice;
    return !!v && v.follow === follow && performance.now() < v.until;
  };

  const play = (to: boolean) => {
    const lag = to ? 0 : UNTIE_LAG;
    run(
      "fill",
      animate(fill, to ? 0 : 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: to ? tieSeconds * 0.6 : lag,
      }),
    );
    if (!motionSafe) {
      // The pose swaps whole; a short fade marks the change.
      for (const key of ["tie", "cinch", "loosen"]) {
        live.current.running.get(key)?.stop();
      }
      tie.jump(to ? 1 : 0);
      cinch.jump(to ? 1 : 0);
      loosen.jump(0);
      ghost.jump(0.2);
      run("ghost", animate(ghost, 1, { duration: durations.fast }));
      if (voiced(to)) {
        audio.play(to ? "snap" : "tick", {
          pitch: to ? r2(0.9 + 0.3 * tn) : 0.8,
          gain: 0.5,
          pan: pan(),
        });
      }
      return;
    }
    if (to) {
      run("tie", animate(tie, 1, { duration: tieSeconds, ease: easings.move }));
      // Thrown, not placed: the harder the pull, the further past tight.
      run(
        "cinch",
        animate(cinch, 1, {
          ...springs.snap,
          velocity: lerp(14, 46, tn),
          delay: tieSeconds * 0.6,
        }),
      );
    } else {
      // Rope first: the knot gives, then the plus straightens out of it.
      run(
        "cinch",
        animate(cinch, 0, { duration: durations.fast, ease: easings.exit }),
      );
      run("tie", animate(tie, 0, { ...springs.snap, delay: 0.09 }));
    }
  };

  const onTie = (v: number) => {
    const s = live.current;
    const was = s.lastTie;
    s.lastTie = v;
    if (was < 0.55 && v >= 0.55 && voiced(true)) {
      audio.play("tick", {
        pitch: r2(1.05 + 0.2 * tn),
        gain: 0.45,
        pan: pan(),
      });
    }
  };

  const onCinch = (v: number) => {
    const s = live.current;
    const was = s.lastCinch;
    s.lastCinch = v;
    if (was < 1 && v >= 1 && voiced(true)) {
      audio.play("snap", { pitch: r2(0.9 + 0.3 * tn), gain: 0.55, pan: pan() });
      s.voice = null;
    }
    if (was > 0.5 && v <= 0.5 && voiced(false)) {
      audio.play("tick", { pitch: 0.8, gain: 0.4, pan: pan() });
      s.voice = null;
    }
  };

  React.useEffect(() => {
    api.current = { play, onTie, onCinch };
  });

  // A press reports first; the rope moves when the state actually changes,
  // so a controlled host that refuses the press never shows a false knot.
  React.useEffect(() => {
    const s = live.current;
    if (s.shown === isPressed) return;
    s.shown = isPressed;
    api.current?.play(isPressed);
  }, [isPressed]);

  React.useEffect(() => {
    const offTie = tie.on("change", (v) => api.current?.onTie(v));
    const offCinch = cinch.on("change", (v) => api.current?.onCinch(v));
    return () => {
      offTie();
      offCinch();
    };
  }, [tie, cinch]);

  // The offer to unfollow: the knot loosens and turns, the pill tints.
  React.useEffect(() => {
    const map = live.current.running;
    const go = (key: string, c: AnimationPlaybackControls) => {
      map.get(key)?.stop();
      map.set(key, c);
    };
    go(
      "wash",
      animate(wash, showPreview ? 1 : 0, {
        duration: durations.fast,
        ease: showPreview ? easings.enter : easings.exit,
      }),
    );
    if (!motionSafe) {
      map.get("loosen")?.stop();
      loosen.jump(0);
      return;
    }
    go("loosen", animate(loosen, showPreview ? 1 : 0, springs.snap));
  }, [showPreview, motionSafe, wash, loosen]);

  // Hovering an unfollowed button lifts the rope's free end, a hint of the tie.
  const hinting = hovering && !isPressed && !disabled && motionSafe;
  React.useEffect(() => {
    const map = live.current.running;
    map.get("hint")?.stop();
    map.set("hint", animate(hint, hinting ? 1 : 0, springs.snap));
  }, [hinting, hint]);

  // The words: the old one leaves on the exit ease, the new one rises on snap.
  React.useLayoutEffect(() => {
    const s = live.current;
    const from = s.word;
    const to = wordIndex;
    if (from === to) return;
    s.word = to;
    const swap = from + to === 3;
    const dir = to > from ? 1 : -1;
    const dist = swap ? distances.nudge : distances.shift;
    const delay = to === 0 ? UNTIE_LAG : swap ? 0 : 0.04;
    const outY = wordY[from];
    const outO = wordOpacity[from];
    const inY = wordY[to];
    const inO = wordOpacity[to];
    if (!outY || !outO || !inY || !inO) return;
    const leave = { ...exitFor(durations.fast), delay };
    run(`o${from}`, animate(outO, 0, leave));
    // The new word starts a beat after the old one, so the slot is clear.
    const arrive = delay + (swap ? 0 : 0.03);
    run(
      `o${to}`,
      animate(inO, 1, {
        duration: durations.fast,
        ease: easings.enter,
        delay: arrive,
      }),
    );
    if (!motionSafe) {
      outY.jump(0);
      inY.jump(0);
      return;
    }
    run(`y${from}`, animate(outY, -dir * dist, leave));
    inY.jump(dir * dist);
    run(`y${to}`, animate(inY, 0, { ...springs.snap, delay: arrive }));
    // Runs once per change of word; the word motion values never change
    // identity, and a theme or motion change mid-swap must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordIndex]);

  // Finish, never freeze: whatever is interrupted lands on its state.
  React.useEffect(() => {
    const s = live.current;
    return () => {
      for (const c of s.running.values()) c.stop();
      s.running.clear();
      window.clearTimeout(s.timer);
      tie.jump(s.shown ? 1 : 0);
      cinch.jump(s.shown ? 1 : 0);
      fill.jump(s.shown ? 0 : 1);
      ghost.jump(1);
      squeeze.jump(0);
      wordY.forEach((y) => y.jump(0));
      wordOpacity.forEach((o, i) => o.jump(i === s.word ? 1 : 0));
    };
    // Teardown only: the motion values are stable and it reads the latest
    // state from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    if (disabled) return;
    const s = live.current;
    const next = !isPressed;
    s.voice = { follow: next, until: performance.now() + 1200 };
    s.suppress = true;
    window.clearTimeout(s.timer);
    setOffer(false);
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const arm = () => {
    const s = live.current;
    window.clearTimeout(s.timer);
    if (s.suppress || disabled) return;
    s.timer = window.setTimeout(
      () => setOffer(true),
      Math.max(0, previewDelay),
    );
  };

  const disarm = () => {
    const s = live.current;
    window.clearTimeout(s.timer);
    s.suppress = false;
    setOffer(false);
  };

  const press = (on: boolean) => {
    if (!motionSafe) return;
    run("squeeze", animate(squeeze, on ? 1 : 0, springs.flick));
  };

  const shape = useTransform(
    [tie, cinch, loosen, hint] as MotionValue<number>[],
    ([t = 0, c = 0, l = 0, h = 0]: number[]) =>
      rope(clamp01(t + 0.14 * h * (1 - t)), c * (1 - 0.3 * l), tn),
  );
  const under = useTransform(shape, (s) => s.under);
  const over = useTransform(shape, (s) => s.over);
  const halo = useTransform(shape, (s) => s.halo);
  const turn = useTransform(loosen, (l) => r2(-untieAngle * l));
  const scale = useTransform(squeeze, (s) => r3(1 - 0.03 * s));

  const name = target ? `${label} ${target}` : label;
  const total = count === undefined ? undefined : count + (isPressed ? 1 : 0);
  const washColour = `color-mix(in oklab, ${danger} 12%, transparent)`;
  // Inks follow the fill, not the state: the rope stays light while the
  // accent is still behind it and turns as the pill clears, so it is never
  // accent drawn on accent mid-tie.
  const inkFor = (followed: string) => (values: number[]) => {
    const onFill = Math.round(clamp01(values[0] ?? 0) * 100);
    const toward = Math.round(clamp01(values[1] ?? 0) * 100);
    return `color-mix(in oklab, color-mix(in oklab, ${accentInk} ${onFill}%, ${followed}) ${100 - toward}%, ${danger})`;
  };
  const tone = [fill, wash] as MotionValue<number>[];
  const ink = useTransform(tone, inkFor("var(--foreground)"));
  const glyphInk = useTransform(tone, inkFor(accent));
  const figureInk = useTransform(tone, inkFor("var(--ink-2)"));
  const words = [label, pressedLabel, releaseLabel];

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      aria-pressed={isPressed}
      aria-label={name}
      aria-describedby={total === undefined ? undefined : countId}
      disabled={disabled}
      onClick={commit}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onPointerEnter={(event) => {
        if (event.pointerType === "touch") return;
        setHovering(true);
        if (isPressed) arm();
      }}
      onPointerLeave={() => {
        press(false);
        setHovering(false);
        disarm();
      }}
      onKeyDown={(event) => {
        if (event.key === " " && !event.repeat) press(true);
        if (event.key === "Enter" && !event.repeat && motionSafe) {
          squeeze.jump(0.7);
          run("squeeze", animate(squeeze, 0, springs.flick));
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " ") press(false);
      }}
      onFocus={(event) => {
        // Keyboard focus offers what a press will do, like a hover.
        if (isPressed && event.currentTarget.matches(":focus-visible")) {
          if (!live.current.suppress) setOffer(true);
        }
      }}
      onBlur={() => {
        press(false);
        disarm();
      }}
      className={cn(
        "group/follow-knot relative isolate inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full border border-hairline-strong font-medium whitespace-nowrap outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-not-allowed disabled:opacity-50",
        compact ? g.square : g.box,
        className,
      )}
      style={{ scale, color: ink, background: BASE }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-px -z-10 rounded-full"
        style={{ background: accent, opacity: fill }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-px -z-10 rounded-full"
        style={{ background: washColour, opacity: wash }}
      />

      <motion.span
        aria-hidden
        className="relative block shrink-0"
        style={{
          width: g.glyph,
          height: g.glyph,
          color: glyphInk,
          rotate: turn,
          opacity: ghost,
        }}
      >
        <svg
          width={g.glyph}
          height={g.glyph}
          viewBox="0 0 24 24"
          fill="none"
          strokeLinejoin="round"
          className="block"
        >
          <motion.path
            d={under}
            stroke="currentColor"
            strokeWidth={ROPE}
            strokeLinecap="round"
          />
          <motion.path
            d={halo}
            strokeWidth={HALO}
            strokeLinecap="butt"
            style={{ stroke: BASE }}
          />
          <motion.path
            d={halo}
            strokeWidth={HALO}
            strokeLinecap="butt"
            style={{ stroke: accent, opacity: fill }}
          />
          <motion.path
            d={halo}
            strokeWidth={HALO}
            strokeLinecap="butt"
            style={{ stroke: washColour, opacity: wash }}
          />
          <motion.path
            d={over}
            stroke="currentColor"
            strokeWidth={ROPE}
            strokeLinecap="round"
          />
        </svg>
      </motion.span>

      {compact ? null : (
        // A slot one line tall: each word leaves through its top or bottom
        // edge, so the two never stack on top of each other mid-swap.
        <span aria-hidden className="grid overflow-clip">
          {words.map((word, i) => (
            <motion.span
              key={i}
              className="col-start-1 row-start-1 text-center"
              style={{ y: wordY[i], opacity: wordOpacity[i] }}
            >
              {word}
            </motion.span>
          ))}
        </span>
      )}

      {compact || total === undefined ? null : (
        <motion.span
          aria-hidden
          className={cn(
            "flex items-center self-stretch border-l font-mono font-normal tabular-nums",
            g.figure,
          )}
          style={{
            color: figureInk,
            borderColor: "color-mix(in oklab, currentColor 28%, transparent)",
          }}
        >
          <Figure
            value={total}
            reserve={[count ?? 0, (count ?? 0) + 1]}
            format={formatCount}
            dir={isPressed ? 1 : -1}
            delay={isPressed ? 0.1 : UNTIE_LAG}
            line={g.line}
            motionSafe={motionSafe}
          />
        </motion.span>
      )}

      {total === undefined ? null : (
        <span id={countId} className="sr-only">
          {describeCount(total)}
        </span>
      )}
    </motion.button>
  );
}
