"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ScreenPrintInks = "cmyk" | "riso" | "duo";

export type ScreenPrintProps = {
  /** What the picture shows. It is on the picture from the first frame, loading or not. */
  alt: string;
  /** An image to load. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: an illustration, a figure. */
  children?: React.ReactNode;
  /**
   * Controlled: whether the picture is ready. Uncontrolled, an image is ready
   * once it has loaded, and children once every pull but the last has run.
   */
  ready?: boolean;
  /** How far the load has got, 0 to 1. The pulls follow it; the last one still waits for `ready`. */
  progress?: number;
  /** Fires once per load, when the print has resolved into the picture. */
  onReady?: () => void;
  /** The pace of every pull, return and flood stroke, 0.5 to 2. @default 1 */
  speed?: number;
  /** How far off register each ink lands, in px, 0 to 4. At 0 every pull is a clean proof. @default 2 */
  register?: number;
  /** Four process inks, three risograph inks, or a two-ink duotone. @default "cmyk" */
  inks?: ScreenPrintInks;
  /** Play the squeegee for the visitor's own pulls. Off unless asked for. @default false */
  sound?: boolean;
  /** The print still runs; the squeegee cannot be taken. */
  disabled?: boolean;
  className?: string;
};

type Rgb = readonly [number, number, number];

type Ink = {
  name: string;
  /** The ink's colour, 0 to 1 per channel: what full coverage leaves of white light. */
  rgb: Rgb;
  /** The picture's channels, weighted, that say where this ink is NOT: its separation. */
  from: Rgb;
  /** How much ink full density lays down, 0 to 1. */
  strength: number;
  /** A key plate: ink only in the shadows, by a curve on luminance. */
  key?: boolean;
};

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

/*
 * The separations. A layer carries (1 − its channel) of its ink, and the
 * layers multiply on the paper. With pure cyan, magenta and yellow that
 * rebuilds the picture exactly; these inks are a touch deeper, like real
 * process inks, so the proof reads a little richer until the picture takes
 * over. Pull order is the printer's: light inks first, the key last.
 */
const INKS: Record<ScreenPrintInks, readonly Ink[]> = {
  cmyk: [
    { name: "yellow", rgb: [1, 0.95, 0], from: [0, 0, 1], strength: 1 },
    { name: "magenta", rgb: [0.98, 0, 0.94], from: [0, 1, 0], strength: 1 },
    { name: "cyan", rgb: [0, 0.94, 1], from: [1, 0, 0], strength: 1 },
    {
      name: "black",
      rgb: [0.12, 0.11, 0.13],
      from: LUMA,
      strength: 1,
      key: true,
    },
  ],
  riso: [
    { name: "yellow", rgb: [1, 0.9, 0], from: [0, 0, 1], strength: 1 },
    { name: "pink", rgb: [1, 0.28, 0.62], from: [0, 1, 0], strength: 1 },
    { name: "blue", rgb: [0, 0.47, 0.75], from: [1, 0, 0], strength: 1 },
  ],
  duo: [
    {
      name: "flame",
      rgb: [1, 0.45, 0.22],
      from: [0, 0.35, 0.65],
      strength: 0.9,
    },
    { name: "navy", rgb: [0.1, 0.2, 0.42], from: LUMA, strength: 0.85 },
  ],
};

/** The key plate's density at luminance 0, 0.2, 0.4 … 1: shadows only. */
const KEY_CURVE = [0.55, 0.24, 0.04, 0, 0, 0];

/** Seconds, at speed 1. */
const PULL = 0.9;
const FINISH = 0.36;
const HAND = 0.5;
const RETURN = 0.42;
const REST = 0.16;
const FLOOD = 1.3;
/** Where the squeegee rests in view: under reduced motion, and between floods. */
const REST_AT = 0.06;

// Fixed art: paper, wood and rubber are the same objects in either theme.
const PAPER = "oklch(0.975 0.008 85)";
const WOOD =
  "linear-gradient(90deg, oklch(0.6 0.075 62), oklch(0.77 0.085 72) 38%, oklch(0.72 0.08 70) 62%, oklch(0.58 0.07 60))";
const RUBBER =
  "linear-gradient(90deg, oklch(0.24 0.015 260), oklch(0.36 0.02 260) 70%, oklch(0.3 0.02 260))";
/** The handle's end grain, darker, over the wood. */
const ENDS =
  "linear-gradient(180deg, oklch(0.5 0.06 58) 0 5px, transparent 5px calc(100% - 5px), oklch(0.5 0.06 58) calc(100% - 5px))";
const MESH_LINE = "oklch(0.42 0.03 250 / 0.06)";
const MESH: React.CSSProperties = {
  backgroundImage: `repeating-linear-gradient(0deg, ${MESH_LINE} 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, ${MESH_LINE} 0 1px, transparent 1px 3px)`,
  boxShadow:
    "inset 0 0 0 1px oklch(0.4 0.02 250 / 0.12), inset 0 0 16px oklch(0.3 0.02 250 / 0.14)",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const f4 = (v: number) => String(Number(v.toFixed(4)));

const css = (c: Rgb) =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** out = 1 − strength·(1 − ink)·(1 − from·rgb), as one colour matrix. */
function matrixOf(ink: Ink): string {
  const rows: number[] = [];
  for (const c of ink.rgb) {
    const a = ink.strength * (1 - c);
    rows.push(a * ink.from[0], a * ink.from[1], a * ink.from[2], 0, 1 - a);
  }
  rows.push(0, 0, 0, 1, 0);
  return rows.map(f4).join(" ");
}

const LUMA_MATRIX = [...LUMA, 0, 0, ...LUMA, 0, 0, ...LUMA, 0, 0, 0, 0, 0, 1, 0]
  .map(f4)
  .join(" ");

const keyTable = (ink: Ink, channel: number) =>
  KEY_CURVE.map((d) =>
    f4(1 - d * ink.strength * (1 - (ink.rgb[channel] ?? 0))),
  ).join(" ");

type Offset = { x: number; y: number };

/** Where each ink lands off register: the first ink is the base the others miss. */
function offsetsOf(seed: number, count: number, px: number): Offset[] {
  const rand = lcg(seed);
  const out: Offset[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const m = (0.55 + rand() * 0.45) * px;
    out.push(
      i === 0
        ? { x: 0, y: 0 }
        : {
            x: r2(Number(Math.cos(a).toFixed(3)) * m),
            y: r2(Number(Math.sin(a).toFixed(3)) * m),
          },
    );
  }
  return out;
}

function Layer({
  reveal,
  snap,
  offset,
  filterId,
  motionSafe,
  children,
}: {
  reveal: MotionValue<number>;
  snap: MotionValue<number>;
  offset: Offset;
  filterId: string;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  // The layer is laid down behind the blade: a clip whose edge is the blade.
  const clip = useTransform(reveal, (v) =>
    motionSafe ? `inset(0 ${r2((1 - clamp01(v)) * 100)}% 0 0)` : "none",
  );
  const opacity = useTransform(reveal, (v) =>
    motionSafe ? 1 : r2(clamp01(v)),
  );
  // Off register by the whole offset until the snap carries it home.
  const x = useTransform(snap, (s) => r2(offset.x * (1 - s)));
  const y = useTransform(snap, (s) => r2(offset.y * (1 - s)));
  return (
    <motion.div
      className="absolute inset-0 mix-blend-multiply"
      style={{ clipPath: clip, opacity }}
    >
      <motion.div className="absolute inset-0" style={{ x, y }}>
        <div
          className="absolute inset-0"
          style={{ filter: `url(#${filterId})` }}
        >
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

type Phase = "auto" | "hand" | "resolving" | "finished";

type Api = {
  advance: () => void;
  reset: () => void;
  resume: () => void;
  halt: () => void;
  afterPull: () => void;
  grab: (clientX: number) => void;
  follow: (dx: number) => void;
  letGo: (vx: number) => void;
  handPull: (clientX: number | null) => void;
  onBlade: (v: number) => void;
};

/**
 * A picture that arrives as a screen print. The box is a sheet of paper
 * under a screen, and the picture is separated into ink layers — one copy of
 * it per ink, each through its own colour separation. A squeegee sweeps each
 * layer across, laying it down behind its blade with a bead of ink riding
 * ahead; each ink lands a few pixels off register, so the colours fringe the
 * way a hand-pulled print does. Every pull but the last runs by itself. The
 * last one waits for the picture — the squeegee floods the screen in slow
 * lifted strokes meanwhile — and as it ends, every layer snaps into register
 * with one crisp overshoot and the print gives way to the picture.
 *
 * The sheet is also the grip: dragging moves the blade 1:1 and prints behind
 * it, dragging back floods without printing, and a release commits by where
 * the throw would come to rest. A tap, or Enter or Space on the focused sheet,
 * pulls one layer. Under reduced motion each pull is a cross-fade at the same
 * pace, the squeegee rests at the edge, and the register snaps in one frame.
 */
export function ScreenPrint({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  register = 2,
  inks = "cmyk",
  sound = false,
  disabled = false,
  className,
}: ScreenPrintProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const set = INKS[inks] ?? INKS.cmyk;
  const n = set.length;
  const pace = Math.min(2, Math.max(0.5, speed));
  const offsets = offsetsOf(
    hash(`${alt}·${inks}`),
    n,
    Math.min(4, Math.max(0, register)),
  );

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const [ranOut, setRanOut] = React.useState(false);
  const isReady = ready ?? (src !== undefined ? loadedSrc === src : ranOut);

  const [done, setDone] = React.useState(0);
  const [finished, setFinished] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const [reveals] = React.useState(() =>
    Array.from({ length: 4 }, () => motionValue(0)),
  );
  const blade = useMotionValue(0);
  const lift = useMotionValue(0);
  const snap = useMotionValue(0);
  const printOpacity = useMotionValue(1);
  const squeegeeOpacity = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pictureRef = React.useRef<HTMLElement | null>(null);
  const refocus = React.useRef(false);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef(new Set<number>());
  const phase = React.useRef<Phase>("auto");
  const busy = React.useRef(false);
  const printing = React.useRef(false);
  const doneRef = React.useRef(0);
  const readyRef = React.useRef(isReady);
  const progressRef = React.useRef(progress);
  const visible = React.useRef(true);
  const reported = React.useRef(false);
  const grip = React.useRef<{ start: number; width: number } | null>(null);
  const api = React.useRef<Api | null>(null);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };

  const wait = (seconds: number, fn: () => void) => {
    const id = window.setTimeout(
      () => {
        timers.current.delete(id);
        fn();
      },
      Math.round(seconds * 1000),
    );
    timers.current.add(id);
  };

  const halt = () => {
    for (const c of running.current.values()) c.stop();
    running.current.clear();
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
    busy.current = false;
  };

  /** How far the machine may pull the current layer by itself. */
  const allowed = () => {
    const k = doneRef.current;
    if (readyRef.current) return 1;
    const p = progressRef.current;
    if (p !== undefined) {
      const t = clamp01(p) * (n - 1);
      return t >= k + 1 ? 1 : Math.max(0, t - k);
    }
    return k < n - 1 ? 1 : 0;
  };

  const pullTo = (
    goal: number,
    mode: "auto" | "finish" | "hand" | "follow",
  ) => {
    const k = doneRef.current;
    const r = reveals[k];
    if (!r) return;
    const from = r.get();
    if (!motionSafe) {
      // The layer arrives whole, as a fade, at the same pace, with the
      // squeegee resting just inside the sheet where all of it shows.
      printing.current = false;
      if (phase.current !== "hand") blade.set(REST_AT);
      run(
        "reveal",
        animate(r, goal, {
          duration: durations.slow / pace,
          ease: easings.enter,
          onComplete: () => api.current?.afterPull(),
        }),
      );
      return;
    }
    // The blade prints from the ink's edge. Anywhere else, it goes there
    // first, lifted, so a pull never skips a strip of the sheet.
    if (Math.abs(blade.get() - from) > 0.01) {
      printing.current = false;
      busy.current = true;
      const gap = Math.abs(blade.get() - from);
      run("lift", animate(lift, 1, springs.flick));
      run(
        "blade",
        animate(blade, from, {
          duration: (RETURN * Math.min(1, gap + 0.3)) / pace,
          ease: easings.move,
          onComplete: () => {
            busy.current = false;
            if (phase.current === "hand") pullTo(goal, mode);
            else api.current?.advance();
          },
        }),
      );
      return;
    }
    printing.current = true;
    run("lift", animate(lift, 0, springs.flick));
    if (mode === "follow") {
      run(
        "blade",
        animate(blade, goal, {
          ...springs.glide,
          onComplete: () => api.current?.afterPull(),
        }),
      );
      return;
    }
    const per = mode === "finish" ? FINISH : mode === "hand" ? HAND : PULL;
    run(
      "blade",
      animate(blade, goal, {
        duration: Math.max(0.12, ((goal - from) * per) / pace),
        // A pull leans in, travels, and eases off at the far edge.
        ease: mode === "auto" ? easings.move : easings.enter,
        onComplete: () => api.current?.afterPull(),
      }),
    );
  };

  /** Slow lifted strokes while the last pull waits: alive, printing nothing. */
  const flood = () => {
    if (!motionSafe) return;
    printing.current = false;
    run("lift", animate(lift, 0.55, springs.glide));
    // Turned short of either edge, so the whole squeegee stays in view.
    run(
      "blade",
      animate(blade, blade.get() < 0.5 ? 1 - REST_AT : REST_AT, {
        duration: FLOOD / pace,
        ease: easings.move,
        onComplete: () => wait((REST * 2) / pace, () => api.current?.advance()),
      }),
    );
  };

  const advance = () => {
    if (!visible.current || busy.current) return;
    if (phase.current === "resolving") {
      registerAll();
      return;
    }
    if (phase.current !== "auto") return;
    const k = doneRef.current;
    if (k >= n) {
      if (readyRef.current) registerAll();
      else flood();
      return;
    }
    const goal = allowed();
    const at = reveals[k]?.get() ?? 0;
    if (goal > at + 0.001) {
      pullTo(
        goal,
        readyRef.current
          ? "finish"
          : progressRef.current !== undefined
            ? "follow"
            : "auto",
      );
    } else if (k === n - 1 && !readyRef.current) {
      flood();
    }
  };

  const finishLayer = (byHand: boolean) => {
    const k = doneRef.current;
    reveals[k]?.set(1);
    const next = k + 1;
    doneRef.current = next;
    setDone(next);
    printing.current = false;
    phase.current = "auto";
    if (byHand) {
      const name = set[k]?.name ?? "ink";
      say(
        `${name.charAt(0).toUpperCase()}${name.slice(1)} pulled, ${next} of ${n}.`,
      );
    }
    if (ready === undefined && src === undefined && next >= n - 1) {
      setRanOut(true);
    }
    if (next >= n && readyRef.current) {
      registerAll();
      return;
    }
    busy.current = true;
    const onward = () => {
      busy.current = false;
      api.current?.advance();
    };
    if (!motionSafe) {
      blade.set(REST_AT);
      wait((PULL + RETURN + REST - durations.slow) / pace, onward);
      return;
    }
    // Lift, and flood back to the start with the next ink's bead.
    run("lift", animate(lift, 1, springs.flick));
    run(
      "blade",
      animate(blade, 0, {
        duration: RETURN / pace,
        delay: 0.06,
        ease: easings.move,
        onComplete: () => wait(REST / pace, onward),
      }),
    );
  };

  const afterPull = () => {
    const k = doneRef.current;
    const at = reveals[k]?.get() ?? 0;
    if (at >= 0.999) {
      finishLayer(phase.current === "hand");
      return;
    }
    if (phase.current === "hand") {
      phase.current = "auto";
      wait(0.6, () => api.current?.advance());
    }
  };

  const finish = () => {
    phase.current = "finished";
    busy.current = false;
    setFinished(true);
    say("Print finished.");
    if (!reported.current) {
      reported.current = true;
      onReady?.();
    }
  };

  /** Every ink home at once, then the print gives way to the picture. */
  function registerAll() {
    if (phase.current === "finished") return;
    halt();
    phase.current = "resolving";
    printing.current = false;
    busy.current = true;
    const resolve = () =>
      run(
        "print",
        animate(printOpacity, 0, {
          duration: durations.slow,
          ease: easings.enter,
          onComplete: finish,
        }),
      );
    if (!motionSafe) {
      snap.set(1);
      squeegeeOpacity.set(0);
      wait(0.12, resolve);
      return;
    }
    run("lift", animate(lift, 1, springs.flick));
    run(
      "leave",
      animate(squeegeeOpacity, 0, {
        duration: durations.base,
        ease: easings.exit,
      }),
    );
    run(
      "blade",
      animate(blade, Math.max(1, blade.get()) + 0.12, {
        duration: durations.base,
        ease: easings.exit,
      }),
    );
    run(
      "snap",
      animate(snap, 1, {
        ...springs.snap,
        onComplete: () => wait(0.2, resolve),
      }),
    );
  }

  const reset = () => {
    halt();
    phase.current = "auto";
    printing.current = false;
    doneRef.current = 0;
    reported.current = false;
    setDone(0);
    setFinished(false);
    for (const r of reveals) r.set(0);
    blade.set(0);
    lift.set(0);
    snap.set(0);
    printOpacity.set(1);
    squeegeeOpacity.set(1);
    advance();
  };

  const resume = () => {
    busy.current = false;
    // A release glide cut short by the page going away never handed back.
    if (phase.current === "hand" && !grip.current) phase.current = "auto";
    advance();
  };

  const grab = (clientX: number) => {
    if (phase.current === "resolving" || phase.current === "finished") return;
    halt();
    phase.current = "hand";
    grip.current = {
      start: blade.get(),
      width: Math.max(1, rootRef.current?.clientWidth ?? 1),
    };
    printing.current = doneRef.current < n;
    squeegeeOpacity.set(1);
    if (motionSafe) run("lift", animate(lift, 0, springs.flick));
    else lift.set(0);
    audio.play("swish", {
      pitch: r2(semitones(Math.min(doneRef.current, n - 1) * 2)),
      gain: 0.45,
      pan: panFrom(clientX, rootRef.current),
    });
  };

  const follow = (dx: number) => {
    const g = grip.current;
    if (!g || phase.current !== "hand") return;
    // 1:1 under the finger; past either edge the blade rubber-bands.
    blade.set(r4(rubberClamp(g.start + dx / g.width, 0, 1, 0.1)));
  };

  const letGo = (vx: number) => {
    const g = grip.current;
    grip.current = null;
    if (phase.current !== "hand") return;
    const v = vx / (g?.width ?? 1);
    const x = blade.get();
    const k = doneRef.current;
    const r = reveals[k];
    const rest = project(x, v, 0.99);
    const complete = r !== undefined && (r.get() >= 0.999 || rest >= 1);
    if (!motionSafe) {
      if (complete) {
        r.set(1);
        finishLayer(true);
        return;
      }
      phase.current = "auto";
      wait(0.6, () => api.current?.advance());
      return;
    }
    if (complete) {
      run(
        "blade",
        animate(blade, 1, {
          ...springs.glide,
          velocity: v,
          onComplete: () => api.current?.afterPull(),
        }),
      );
      return;
    }
    run(
      "blade",
      animate(blade, clamp01(rest), {
        ...springs.glide,
        velocity: v,
        onComplete: () => {
          phase.current = "auto";
          wait(0.6, () => api.current?.advance());
        },
      }),
    );
  };

  const handPull = (clientX: number | null) => {
    if (disabled) return;
    if (phase.current === "resolving" || phase.current === "finished") return;
    halt();
    phase.current = "hand";
    squeegeeOpacity.set(1);
    const rect = rootRef.current?.getBoundingClientRect();
    audio.play("swish", {
      pitch: r2(semitones(Math.min(doneRef.current, n - 1) * 2)),
      gain: 0.5,
      pan: panFrom(
        clientX ?? (rect ? rect.left + rect.width / 2 : 0),
        rootRef.current,
      ),
    });
    if (doneRef.current < n) {
      pullTo(1, "hand");
      return;
    }
    // Everything is printed: a hand stroke only floods the screen.
    if (!motionSafe) {
      phase.current = "auto";
      return;
    }
    run(
      "blade",
      animate(blade, blade.get() < 0.5 ? 1 - REST_AT : REST_AT, {
        duration: HAND / pace,
        ease: easings.move,
        onComplete: () => {
          phase.current = "auto";
          wait(0.4, () => api.current?.advance());
        },
      }),
    );
  };

  const onBlade = (v: number) => {
    if (!printing.current) return;
    const r = reveals[doneRef.current];
    // Ink only goes down ahead of what is already printed: a blade moving
    // back over the sheet is a flood stroke.
    if (r && v > r.get()) r.set(r4(clamp01(v)));
  };

  React.useEffect(() => {
    api.current = {
      advance,
      reset,
      resume,
      halt,
      afterPull,
      grab,
      follow,
      letGo,
      handPull,
      onBlade,
    };
  });

  React.useEffect(
    () => blade.on("change", (v) => api.current?.onBlade(v)),
    [blade],
  );

  // The picture's readiness, from the host or the load. Ready carries the
  // print on to its last pull; ready taken away starts a fresh sheet.
  const shownReady = React.useRef(isReady);
  React.useEffect(() => {
    readyRef.current = isReady;
    if (shownReady.current === isReady) return;
    const was = shownReady.current;
    shownReady.current = isReady;
    if (was && !isReady) api.current?.reset();
    else api.current?.advance();
  }, [isReady]);

  React.useEffect(() => {
    progressRef.current = progress;
    api.current?.advance();
  }, [progress]);

  // A different ink set is a different print.
  const shownInks = React.useRef(inks);
  React.useEffect(() => {
    if (shownInks.current === inks) return;
    shownInks.current = inks;
    api.current?.reset();
  }, [inks]);

  // Start (or, after StrictMode's rehearsal, carry on) from wherever the
  // values stand; stop everything on the way out.
  React.useEffect(() => {
    api.current?.advance();
    return () => api.current?.halt();
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      const now = !document.hidden;
      if (now === visible.current) return;
      visible.current = now;
      if (now) api.current?.resume();
      else api.current?.halt();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Off screen nothing runs; back on screen the print carries on.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const now = Boolean(entry?.isIntersecting) && !document.hidden;
      if (now === visible.current) return;
      visible.current = now;
      if (now) api.current?.resume();
      else api.current?.halt();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  // The grip leaves when the print resolves; if it held focus, the picture
  // takes it rather than the page.
  const bindGrip = React.useCallback((node: HTMLButtonElement | null) => {
    if (!node) return;
    return () => {
      if (document.activeElement === node) refocus.current = true;
    };
  }, []);

  React.useEffect(() => {
    if (!finished || !refocus.current) return;
    refocus.current = false;
    pictureRef.current?.focus({ preventScroll: true });
  }, [finished]);

  const bindImage = React.useCallback(
    (node: HTMLImageElement | null) => {
      pictureRef.current = node;
      // Settled before hydration: its load (or error) event has been and gone.
      if (node && src !== undefined && node.complete) setLoadedSrc(src);
    },
    [src],
  );
  const bindPicture = React.useCallback((node: HTMLDivElement | null) => {
    pictureRef.current = node;
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || finished,
    onStart: ({ point }) => api.current?.grab(point.x),
    onMove: ({ offset }) => api.current?.follow(offset.x),
    onEnd: ({ velocity }) => api.current?.letGo(velocity.x),
    onCancel: () => api.current?.letGo(0),
    onTap: (event) => api.current?.handPull(event.clientX),
  });

  const bladeLeft = useTransform(blade, (v) => `${r2(v * 100)}%`);
  const liftScale = useTransform(lift, (l) => r4(1 + 0.035 * l));
  const handleShadow = useTransform(
    lift,
    (l) =>
      `${r2(-1.5 - 3 * l)}px ${r2(1.5 + 3 * l)}px ${r2(3 + 7 * l)}px color-mix(in oklab, black ${Math.round(20 + 8 * l)}%, transparent)`,
  );

  const ink = set[Math.min(done, n - 1)] ?? set[0];
  const bead = ink ? css(ink.rgb) : "transparent";
  const copy =
    src !== undefined ? (
      // A registry component cannot depend on a framework's image loader.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        draggable={false}
        className="block size-full object-cover"
      />
    ) : (
      children
    );
  const gripLabel =
    done < n
      ? `Pull the ${set[done]?.name ?? ""} ink by hand`
      : "Flood the screen by hand";

  return (
    <div
      ref={bindRoot}
      aria-busy={!finished || undefined}
      className={cn(
        "group/screen-print relative isolate block aspect-[3/2] w-full overflow-clip rounded-3 border border-hairline bg-surface-2 select-none",
        className,
      )}
    >
      <div className="absolute inset-0">
        {src !== undefined ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={bindImage}
            src={src}
            alt={alt}
            tabIndex={-1}
            draggable={false}
            // A picture that fails to arrive stops the print too: its alt is
            // all there is to show, and a loader must not run forever.
            onLoad={() => setLoadedSrc(src)}
            onError={() => setLoadedSrc(src)}
            className="block size-full object-cover outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
        ) : (
          <div
            ref={bindPicture}
            role="img"
            aria-label={alt}
            tabIndex={-1}
            className="size-full outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {children}
          </div>
        )}
      </div>

      {finished ? null : (
        <>
          <svg aria-hidden width={0} height={0} className="absolute">
            <defs>
              {set.map((k, i) => (
                <filter
                  key={k.name}
                  id={`${uid}-ink-${i}`}
                  x="0"
                  y="0"
                  width="1"
                  height="1"
                  colorInterpolationFilters="sRGB"
                >
                  {k.key ? (
                    <>
                      <feColorMatrix type="matrix" values={LUMA_MATRIX} />
                      <feComponentTransfer>
                        <feFuncR type="table" tableValues={keyTable(k, 0)} />
                        <feFuncG type="table" tableValues={keyTable(k, 1)} />
                        <feFuncB type="table" tableValues={keyTable(k, 2)} />
                      </feComponentTransfer>
                    </>
                  ) : (
                    <feColorMatrix type="matrix" values={matrixOf(k)} />
                  )}
                </filter>
              ))}
            </defs>
          </svg>

          <motion.div
            aria-hidden
            inert
            className="pointer-events-none absolute inset-0 isolate"
            style={{ opacity: printOpacity }}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: PAPER }}
            />
            {set.map((k, i) => {
              const reveal = reveals[i];
              if (!reveal) return null;
              return (
                <Layer
                  key={`${inks}-${k.name}`}
                  reveal={reveal}
                  snap={snap}
                  offset={offsets[i] ?? { x: 0, y: 0 }}
                  filterId={`${uid}-ink-${i}`}
                  motionSafe={motionSafe}
                >
                  {copy}
                </Layer>
              );
            })}
            <div className="absolute inset-0" style={MESH} />
          </motion.div>

          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-2 z-10 w-0"
            style={{
              left: bladeLeft,
              opacity: squeegeeOpacity,
              scale: liftScale,
            }}
          >
            {/* One row, so handle, blade and bead never part at a
                fractional position: the blade's leading edge is x = 0. */}
            <div className="absolute -inset-y-[3px] -left-[17px] flex">
              <motion.span
                className="w-[14px] rounded-[4px] transition-[filter] duration-200 group-hover/screen-print:brightness-110"
                style={{
                  background: `${ENDS}, ${WOOD}`,
                  boxShadow: handleShadow,
                }}
              />
              <span
                className="my-[3px] -ml-[2px] w-[5px] rounded-r-[2px]"
                style={{ background: RUBBER }}
              />
              <span
                className="my-[6px] -ml-px w-[6px] rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: bead,
                  backgroundImage:
                    "linear-gradient(90deg, oklch(0 0 0 / 0.22), transparent 45%, oklch(1 0 0 / 0.45) 62%, transparent 80%)",
                }}
              />
            </div>
          </motion.div>

          <button
            ref={bindGrip}
            type="button"
            aria-label={gripLabel}
            aria-describedby={hintId}
            disabled={disabled}
            onClick={(event) => {
              // Pointer pulls arrive through the drag's tap. A click with no
              // pointer behind it — Enter, Space, assistive technology — is a
              // pull too, sound and all.
              if (event.detail === 0) api.current?.handPull(null);
            }}
            {...drag}
            className={cn(
              "absolute inset-0 z-20 size-full touch-pan-y rounded-[inherit] outline-none select-none [-webkit-touch-callout:none]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              disabled
                ? "cursor-default"
                : "cursor-grab active:cursor-grabbing",
            )}
          />
          <p id={hintId} className="sr-only">
            Drag across the sheet to pull the ink, or press Enter to pull it.
          </p>
        </>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
