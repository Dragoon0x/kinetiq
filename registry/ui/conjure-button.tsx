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
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ConjureStatus = "idle" | "working" | "done" | "error";
export type ConjurePalette = "aurora" | "mono" | "ember";

export type ConjureButtonProps = {
  /** The run's state, owned by the host. The button never decides it is finished. */
  status?: ConjureStatus;
  /** Initial state when uncontrolled. @default "idle" */
  defaultStatus?: ConjureStatus;
  /**
   * Reports `"working"` from the press. Uncontrolled, it also reports
   * `"done"` or `"error"` when the promise from `onConjure` settles.
   */
  onStatusChange?: (status: ConjureStatus) => void;
  /**
   * The work. Uncontrolled, a returned promise settles the run — resolve for
   * done, reject for error; a plain return means the work is already done.
   */
  onConjure?: () => void | Promise<unknown>;
  /** The label at rest, before a run. */
  label: string;
  /** What assistive technology hears while the host works. @default "Working" */
  workingLabel?: string;
  /** The finished label the particles condense into. @default "Done" */
  doneLabel?: string;
  /** The label after a failed run. @default "Try again" */
  errorLabel?: string;
  /** How many glyphs the label comes apart into, 12 to 48. @default 24 */
  particles?: number;
  /** Orbit speed in laps per second; the shimmer sweeps with it. @default 0.4 */
  orbit?: number;
  /** The particles' colours. @default "aurora" */
  palette?: ConjurePalette;
  /** Scan a band of light across the button while the host works. @default true */
  shimmer?: boolean;
  /** Play the run's sounds. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Face = "idle" | "done" | "error";
type Point = { x: number; y: number };
type FaceLayout = { glyphs: Point[]; icon: Point };
type Layout = { w: number; h: number; faces: Record<Face, FaceLayout> };
type Anchor = { x: number; y: number; ch: string; order: number };
type Seed = {
  phase: number;
  ring: number;
  speed: number;
  size: number;
  jitter: number;
  mix: number;
};

const FACES: readonly Face[] = ["idle", "done", "error"];
const FACE_INDEX: Record<Face, number> = { idle: 0, done: 1, error: 2 };
const TAU = Math.PI * 2;
/** The share of a progress the left-to-right stagger may use. */
const SPREAD = 0.4;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const stagger = (p: number, order: number) =>
  clamp01((p - order) / (1 - SPREAD));
const faceAt = (index: number): Face => FACES[Math.round(index)] ?? "idle";
const restFace = (status: ConjureStatus): Face =>
  status === "working" ? "idle" : status;

/** FNV-1a, kept unsigned, so a label always breaks into the same swarm. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeeds(count: number, seed: number): Seed[] {
  const next = seeded(seed);
  return Array.from({ length: count }, (_, i) => ({
    // Evenly spread round the orbit, then nudged, so the swarm never clumps.
    phase: r3(((i + next() * 0.7) / count) * TAU),
    ring: r3(0.45 + next() * 0.55),
    speed: r3(0.8 + next() * 0.4),
    size: r3(0.78 + next() * 0.3),
    jitter: r3(next()),
    mix: Math.round(next() * 100),
  }));
}

const PARTICLE_COLOR: Record<ConjurePalette, (mix: number) => string> = {
  aurora: (m) =>
    `color-mix(in oklch, var(--accent-bright) ${m}%, var(--signal))`,
  ember: (m) => `color-mix(in oklch, var(--warn) ${m}%, var(--danger))`,
  mono: () => "currentColor",
};

const ACCENT: Record<ConjurePalette, string> = {
  aurora: "var(--accent-bright)",
  ember: "var(--warn)",
  mono: "currentColor",
};

const BAND: Record<ConjurePalette, string> = {
  aurora:
    "linear-gradient(100deg, transparent, color-mix(in oklch, var(--accent-bright) 22%, transparent) 42%, color-mix(in oklch, var(--signal) 20%, transparent) 58%, transparent)",
  ember:
    "linear-gradient(100deg, transparent, color-mix(in oklch, var(--warn) 22%, transparent) 42%, color-mix(in oklch, var(--danger) 18%, transparent) 58%, transparent)",
  mono: "linear-gradient(100deg, transparent, color-mix(in oklch, var(--ink) 12%, transparent) 50%, transparent)",
};

const WORKING_BORDER: Record<ConjurePalette, string> = {
  aurora: "border-cobalt-bright/50",
  ember: "border-warn/50",
  mono: "border-ink-3",
};

/** A letter at rest is 1; 0→1 writes it in, 1→2 lifts it away. */
const letterShown = (p: number, order: number) =>
  p <= 1 ? stagger(p, order) : 1 - Math.min(1, stagger(p - 1, order) * 2.5);
const letterRise = (p: number, order: number) =>
  p <= 1
    ? (1 - stagger(p, order)) * distances.nudge
    : -Math.min(1, stagger(p - 1, order) * 2.5) * 3;

function centreOf(el: HTMLElement, root: HTMLElement): Point {
  // Offsets, not client rects: a letter mid-rise is transformed, and the
  // particles need where it sits in the line, not where it is drawn.
  let x = el.offsetWidth / 2;
  let y = el.offsetHeight / 2;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x: r2(x), y: r2(y) };
}

function SparkleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none">
      <path
        d="M8 1.75 9.35 6.65 14.25 8 9.35 9.35 8 14.25 6.65 9.35 1.75 8 6.65 6.65Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none">
      <path
        d="M3.25 8.5 6.5 11.5 12.75 4.75"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none">
      <path
        d="M12.9 9.1A5 5 0 1 1 11.6 4.4M12.25 1.75v2.9h-2.9"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Letter({
  ch,
  index,
  order,
  phase,
  motionSafe,
}: {
  ch: string;
  index: number;
  order: number;
  phase: MotionValue<number>;
  motionSafe: boolean;
}) {
  const opacity = useTransform(phase, (p) => r3(letterShown(p, order)));
  const y = useTransform(phase, (p) =>
    motionSafe ? r2(letterRise(p, order)) : 0,
  );
  return (
    <motion.span
      data-glyph={index}
      className="inline-block"
      style={{ opacity, y }}
    >
      {ch}
    </motion.span>
  );
}

function FaceLabel({
  face,
  text,
  phase,
  motionSafe,
  iconClassName,
  iconStyle,
  hoverTurn,
}: {
  face: Face;
  text: string;
  phase: MotionValue<number>;
  motionSafe: boolean;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  hoverTurn: boolean;
}) {
  const chars = Array.from(text);
  const last = Math.max(1, chars.length - 1);
  const iconOpacity = useTransform(phase, (p) => r3(letterShown(p, 0)));
  const iconY = useTransform(phase, (p) =>
    motionSafe ? r2(letterRise(p, 0)) : 0,
  );
  return (
    <span
      data-face={face}
      className="inline-flex items-center gap-2 whitespace-pre [grid-area:1/1]"
    >
      <motion.span
        data-icon=""
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center",
          hoverTurn &&
            "transition-[rotate] duration-300 group-hover/conjure-button:rotate-45",
          iconClassName,
        )}
        style={{ ...iconStyle, opacity: iconOpacity, y: iconY }}
      >
        {face === "idle" ? (
          <SparkleIcon />
        ) : face === "done" ? (
          <CheckIcon />
        ) : (
          <RetryIcon />
        )}
      </motion.span>
      <span>
        {chars.map((ch, j) => (
          <Letter
            key={j}
            ch={ch}
            index={j}
            order={(SPREAD * j) / last}
            phase={phase}
            motionSafe={motionSafe}
          />
        ))}
      </span>
    </span>
  );
}

type Geometry = { cx: number; cy: number; rx: number; ry: number };

function Particle({
  seed,
  anchors,
  geo,
  orbit,
  motionSafe,
  color,
  clock,
  gather,
  land,
  burst,
  from,
  to,
}: {
  seed: Seed;
  anchors: Record<Face, Anchor>;
  geo: Geometry;
  orbit: number;
  motionSafe: boolean;
  color: string;
  clock: MotionValue<number>;
  gather: MotionValue<number>;
  land: MotionValue<number>;
  burst: MotionValue<number>;
  from: MotionValue<number>;
  to: MotionValue<number>;
}) {
  const inputs = [clock, gather, land, burst, from, to];

  const place = (values: number[]) => {
    const [t = 0, g = 0, l = 0, b = 0, f = 0, d = 0] = values;
    const home = anchors[faceAt(f)];
    const dest = anchors[faceAt(d)];
    const theta = seed.phase + (motionSafe ? TAU * orbit * seed.speed * t : 0);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // A failed run throws the swarm outward along its own heading; the pill
    // is wide and short, so the push is stretched to match.
    const push = b * (16 + 18 * seed.jitter);
    const ox = geo.cx + cos * (geo.rx * seed.ring + push * 1.6);
    const oy = geo.cy + sin * (geo.ry * seed.ring + push * 0.8);
    // Front of the orbit (lower half) is nearer: bigger and brighter.
    const depth = (sin + 1) / 2;
    if (!motionSafe) {
      const twinkle =
        0.35 +
        0.65 * (0.5 + 0.5 * Math.sin(TAU * t * (0.6 + orbit) + seed.phase * 3));
      return {
        x: ox,
        y: oy,
        s: seed.size,
        o: g * (1 - l) * (1 - b) * twinkle,
      };
    }
    const gi = stagger(g, home.order);
    const li = stagger(l, dest.order);
    // Lifting letters rise off the line before they swing into orbit.
    const lx = home.x + (ox - home.x) * gi;
    const ly = home.y + (oy - home.y) * gi - 7 * Math.sin(Math.PI * gi);
    const x = lx + (dest.x - lx) * li;
    const y = ly + (dest.y - ly) * li;
    const orbitScale = seed.size * (0.72 + 0.28 * depth);
    const s = 1 + (orbitScale - 1) * gi * (1 - li);
    const shade = 1 + (0.4 + 0.6 * depth - 1) * gi;
    const o = Math.min(1, gi * 2.5) * (1 - li) * (1 - b) * shade;
    return { x, y, s, o };
  };

  const transform = useTransform(inputs, (values) => {
    const p = place(values as number[]);
    return `translate(${r2(p.x)}px, ${r2(p.y)}px) scale(${r3(p.s)})`;
  });
  const opacity = useTransform(inputs, (values) =>
    r3(place(values as number[]).o),
  );
  const glyph = useTransform(from, (f) => anchors[faceAt(f)].ch);

  return (
    <motion.span
      className="absolute top-0 left-0 -mt-2 -ml-2 flex size-4 items-center justify-center text-[12px] leading-none font-semibold"
      style={{ transform, opacity, color }}
    >
      {glyph}
    </motion.span>
  );
}

function Spark({
  at,
  spark,
  color,
}: {
  at: Point;
  spark: MotionValue<number>;
  color: string;
}) {
  const d = useTransform(spark, (s) => {
    const inner = 5 + 5 * s;
    const outer = 7 + 10 * s;
    const k = 0.7071;
    return [
      [k, k],
      [-k, k],
      [-k, -k],
      [k, -k],
    ]
      .map(
        ([dx = 0, dy = 0]) =>
          `M${r2(at.x + dx * inner)} ${r2(at.y + dy * inner)}L${r2(at.x + dx * outer)} ${r2(at.y + dy * outer)}`,
      )
      .join("");
  });
  const ring = useTransform(spark, (s) => r2(4 + 11 * s));
  const opacity = useTransform(spark, (s) => r3((1 - s) * Math.min(1, s * 8)));
  return (
    <motion.g style={{ opacity, color }}>
      <motion.path
        d={d}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <motion.circle
        cx={at.x}
        cy={at.y}
        r={ring}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
      />
    </motion.g>
  );
}

/**
 * A generate button whose own label is the material. Pressed, the letters
 * lift off their places one after another and become glyph particles that
 * swing into an orbit inside the pill while a band of light scans it. It
 * never decides it is finished: when the host's `status` says done, every
 * particle leaves the orbit for a letter of the new label, landing left to
 * right as that letter writes in, and a spark flares from the icon; when it
 * says error, the orbit scatters outward and the pill shakes once.
 *
 * The swarm is DOM glyphs placed by motion values — one clock and four shared
 * progresses, each particle mapping them through its own seeded delay — so
 * nothing re-renders per frame and nothing is random. It is a real button:
 * Space and Enter press it, its name is the current label, it is busy while
 * the host works, and a polite status says what happened. Under reduced
 * motion the letters cross-fade and the glyphs twinkle in place instead of
 * travelling.
 */
export function ConjureButton({
  status: statusProp,
  defaultStatus = "idle",
  onStatusChange,
  onConjure,
  label,
  workingLabel = "Working",
  doneLabel = "Done",
  errorLabel = "Try again",
  particles = 24,
  orbit = 0.4,
  palette = "aurora",
  shimmer = true,
  sound = false,
  disabled = false,
  className,
}: ConjureButtonProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const controlled = statusProp !== undefined;
  const [own, setOwn] = React.useState<ConjureStatus>(defaultStatus);
  const status = statusProp ?? own;
  const working = status === "working";

  const [button, setButton] = React.useState<HTMLButtonElement | null>(null);
  const [stack, setStack] = React.useState<HTMLSpanElement | null>(null);
  const [layout, setLayout] = React.useState<Layout | null>(null);

  const count = Math.min(64, Math.max(4, Math.round(particles)));
  const speed = Math.min(2, Math.max(0, orbit));
  const texts = React.useMemo<Record<Face, string>>(
    () => ({ idle: label, done: doneLabel, error: errorLabel }),
    [label, doneLabel, errorLabel],
  );
  const seeds = React.useMemo(
    () => makeSeeds(count, hash(label)),
    [count, label],
  );

  const [initial] = React.useState(status);
  const clock = useMotionValue(0);
  const gather = useMotionValue(initial === "working" ? 1 : 0);
  const land = useMotionValue(0);
  const burst = useMotionValue(0);
  const spark = useMotionValue(0);
  const shake = useMotionValue(0);
  const from = useMotionValue(FACE_INDEX.idle);
  const to = useMotionValue(FACE_INDEX.idle);
  const idlePhase = useMotionValue(initial === "idle" ? 1 : 0);
  const donePhase = useMotionValue(initial === "done" ? 1 : 0);
  const errorPhase = useMotionValue(initial === "error" ? 1 : 0);
  const phases = React.useMemo<Record<Face, MotionValue<number>>>(
    () => ({ idle: idlePhase, done: donePhase, error: errorPhase }),
    [idlePhase, donePhase, errorPhase],
  );

  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const subs = React.useRef<(() => void)[]>([]);
  const clockRun = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef(status);
  // Sounds belong to the press that started the run; a host that flips the
  // status with no press behind it animates in silence.
  const armed = React.useRef(false);
  const runId = React.useRef(0);
  const alive = React.useRef(false);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Letter homes are measured, so the particles leave from and land on the
  // real glyphs. Bound to the nodes as they arrive, and re-run when a label
  // changes (a fresh observer always reports once).
  React.useEffect(() => {
    if (!button || !stack || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const faces = {} as Record<Face, FaceLayout>;
      for (const face of FACES) {
        const el = stack.querySelector<HTMLElement>(`[data-face="${face}"]`);
        const glyphs = el
          ? Array.from(el.querySelectorAll<HTMLElement>("[data-glyph]")).map(
              (g) => centreOf(g, button),
            )
          : [];
        const icon = el?.querySelector<HTMLElement>("[data-icon]");
        faces[face] = {
          glyphs,
          icon: icon
            ? centreOf(icon, button)
            : { x: r2(button.clientWidth / 2), y: r2(button.clientHeight / 2) },
        };
      }
      const next: Layout = {
        w: button.clientWidth,
        h: button.clientHeight,
        faces,
      };
      setLayout((prev) =>
        prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stack);
    observer.observe(button);
    return () => observer.disconnect();
  }, [button, stack, texts]);

  const halt = React.useCallback(() => {
    for (const run of runs.current) run.stop();
    runs.current = [];
    for (const off of subs.current) off();
    subs.current = [];
  }, []);

  const stopClock = React.useCallback(() => {
    clockRun.current?.stop();
    clockRun.current = null;
  }, []);

  // The orbit's clock exists only while the swarm is alive: a linear run of
  // seconds (an hour's worth — no run is that long), stopped the moment the
  // particles settle, so nothing ticks at rest or off-screen.
  const runClock = React.useCallback(() => {
    clockRun.current?.stop();
    const start = clock.get();
    clockRun.current = animate(clock, start + 3600, {
      duration: 3600,
      ease: "linear",
    });
  }, [clock]);

  const once = React.useCallback(
    (value: MotionValue<number>, past: number, then: () => void) => {
      const off = value.on("change", (v) => {
        if (v < past) return;
        off();
        then();
      });
      subs.current.push(off);
    },
    [],
  );

  const pan = React.useCallback(() => {
    if (!button) return 0;
    const rect = button.getBoundingClientRect();
    return panFrom(rect.left + rect.width / 2, null);
  }, [button]);

  const settle = React.useCallback(
    (face: Face) => {
      stopClock();
      gather.set(0);
      land.set(0);
      burst.set(0);
      for (const f of FACES) if (f !== face) phases[f].set(0);
      phases[face].set(1);
      armed.current = false;
    },
    [burst, gather, land, phases, stopClock],
  );

  const play = React.useCallback(
    (prev: ConjureStatus, next: ConjureStatus) => {
      halt();
      const heard = armed.current;
      const tween = { duration: durations.base, ease: easings.enter };
      const move = motionSafe ? springs.glide : tween;

      if (next === "working") {
        const face = restFace(prev);
        // An interrupted hand-over can leave a label half written; only the
        // one that is lifting stays.
        for (const f of FACES) if (f !== face) phases[f].set(0);
        from.set(FACE_INDEX[face]);
        land.set(0);
        burst.set(0);
        spark.set(0);
        gather.set(0);
        runClock();
        // The label's own phase rides the same spring as the swarm, so each
        // letter fades on exactly the frame its particles leave it.
        runs.current.push(
          animate(gather, 1, move),
          animate(phases[face], 2, move),
        );
        if (heard) {
          const p = pan();
          audio.play("shimmer", {
            pitch: r3(0.9 + ((count - 12) / 36) * 0.25),
            gain: 0.5,
            pan: p,
          });
          once(gather, 0.92, () =>
            audio.play("rise", { pitch: 1.1, gain: 0.28, pan: p }),
          );
        }
        return;
      }

      const face = next;
      if (prev !== "working") {
        // Rest to rest (a host reset, or a result with no run shown): the
        // labels trade places, no swarm.
        const old = restFace(prev);
        for (const f of FACES) if (f !== old) phases[f].set(0);
        runs.current.push(
          animate(phases[old], 2, {
            duration: durations.fast,
            ease: easings.exit,
          }),
          animate(phases[face], 1, {
            duration: durations.base,
            ease: easings.enter,
            delay: 0.06,
            onComplete: () => settle(face),
          }),
        );
        return;
      }

      const lifted = faceAt(from.get());
      to.set(FACE_INDEX[face]);
      if (lifted !== face) {
        runs.current.push(
          animate(phases[lifted], 2, { duration: durations.fast }),
        );
      }
      if (gather.get() < 1) runs.current.push(animate(gather, 1, move));

      if (next === "error") {
        const p = pan();
        if (heard) audio.play("thud", { gain: 0.6, pan: p });
        runs.current.push(
          animate(burst, 1, {
            duration: motionSafe ? durations.slow : durations.base,
            ease: easings.enter,
          }),
        );
        if (motionSafe) {
          // Exits never spring, and a shake is five keyframes: a tween.
          runs.current.push(
            animate(shake, [0, -4, 4, -3, 2, 0], {
              duration: 0.36,
              ease: "easeOut",
            }),
          );
        }
        phases.error.set(0);
        runs.current.push(
          animate(phases.error, 1, {
            ...move,
            delay: 0.14,
            onComplete: () => settle("error"),
          }),
        );
        return;
      }

      // Done, or a cancel back to idle: the swarm condenses into the letters.
      phases[face].set(0);
      spark.set(0);
      runs.current.push(
        animate(land, 1, move),
        animate(phases[face], 1, {
          ...move,
          onComplete: () => settle(face),
        }),
      );
      if (next === "done") {
        once(land, 0.82, () => {
          runs.current.push(
            animate(spark, 1, {
              duration: motionSafe ? durations.slow : durations.base,
              ease: easings.enter,
            }),
          );
          if (heard) audio.play("chime", { gain: 0.45, pan: pan() });
        });
      }
    },
    [
      audio,
      burst,
      count,
      from,
      gather,
      halt,
      land,
      motionSafe,
      once,
      pan,
      phases,
      runClock,
      settle,
      shake,
      spark,
      to,
    ],
  );

  // The host speaks through `status`; every change it makes gets the same
  // choreography a press would have led to.
  React.useEffect(() => {
    const prev = shown.current;
    if (prev === status) return;
    shown.current = status;
    play(prev, status);
  }, [status, play]);

  // Mounted mid-run: the swarm is already in orbit, so its clock runs.
  React.useEffect(() => {
    if (shown.current === "working") runClock();
    return () => {
      halt();
      stopClock();
    };
  }, [halt, runClock, stopClock]);

  const finish = (run: number, next: ConjureStatus) => {
    if (run !== runId.current || !alive.current) return;
    setOwn(next);
    onStatusChange?.(next);
  };

  const press = () => {
    if (disabled || working) return;
    armed.current = true;
    onStatusChange?.("working");
    let result: unknown;
    try {
      result = onConjure?.();
    } catch {
      if (!controlled) {
        setOwn("error");
        onStatusChange?.("error");
      }
      return;
    }
    if (controlled) return;
    if (
      result !== null &&
      typeof result === "object" &&
      typeof (result as PromiseLike<unknown>).then === "function"
    ) {
      const run = ++runId.current;
      setOwn("working");
      (result as PromiseLike<unknown>).then(
        () => finish(run, "done"),
        () => finish(run, "error"),
      );
    } else {
      // Returned without a promise: the work is already done.
      setOwn("done");
      onStatusChange?.("done");
    }
  };

  const name =
    status === "working"
      ? workingLabel
      : status === "done"
        ? doneLabel
        : status === "error"
          ? errorLabel
          : label;
  const spoken = status === "idle" ? "" : name;

  const geo = React.useMemo<Geometry | null>(
    () =>
      layout
        ? {
            cx: r2(layout.w / 2),
            cy: r2(layout.h / 2),
            rx: r2(Math.max(8, layout.w / 2 - 16)),
            ry: r2(Math.max(4, layout.h / 2 - 11)),
          }
        : null,
    [layout],
  );

  const anchors = React.useMemo(() => {
    if (!layout) return null;
    const solid = {} as Record<Face, number[]>;
    for (const face of FACES) {
      solid[face] = Array.from(texts[face]).flatMap((c, j) =>
        c.trim() ? [j] : [],
      );
    }
    return seeds.map((seed, i) => {
      const out = {} as Record<Face, Anchor>;
      for (const face of FACES) {
        const chars = Array.from(texts[face]);
        const list = solid[face];
        const j = list.length > 0 ? (list[i % list.length] ?? 0) : -1;
        const at = j >= 0 ? layout.faces[face].glyphs[j] : undefined;
        const last = Math.max(1, chars.length - 1);
        out[face] = {
          x: at?.x ?? r2(layout.w / 2),
          y: at?.y ?? r2(layout.h / 2),
          ch: j >= 0 ? (chars[j] ?? "·") : "·",
          order: r3(
            Math.min(
              SPREAD,
              (SPREAD * Math.max(0, j)) / last + seed.jitter * 0.05,
            ),
          ),
        };
      }
      return out;
    });
  }, [layout, seeds, texts]);

  const bandX = useTransform(
    [clock, gather, land, burst] as MotionValue<number>[],
    (values) => {
      const [t = 0, g = 0, l = 0, b = 0] = values as number[];
      // Parked inside the pill whenever it is not showing, so an idle button
      // never holds a box that reaches past its own edges.
      if (!layout || !motionSafe || g * (1 - l) * (1 - b) <= 0) return 0;
      const sweep = (t * (0.45 + speed * 0.6)) % 1;
      return r2(sweep * layout.w * 1.5 - layout.w * 0.5);
    },
  );
  const bandOpacity = useTransform(
    [clock, gather, land, burst] as MotionValue<number>[],
    (values) => {
      const [t = 0, g = 0, l = 0, b = 0] = values as number[];
      if (!shimmer) return 0;
      const presence = g * (1 - l) * (1 - b);
      if (motionSafe) return r3(presence * 0.9);
      // Still, it breathes instead of sweeping.
      return r3(presence * (0.45 + 0.25 * Math.sin(TAU * t * 0.5)));
    },
  );

  const accent = ACCENT[palette] ?? ACCENT.aurora;
  const particleColor = PARTICLE_COLOR[palette] ?? PARTICLE_COLOR.aurora;

  return (
    <span className={cn("relative inline-flex", className)}>
      <motion.button
        ref={setButton}
        type="button"
        aria-label={name}
        aria-busy={working || undefined}
        disabled={disabled}
        onClick={press}
        whileTap={motionSafe && !working ? { scale: 0.97 } : undefined}
        transition={springs.flick}
        style={{ x: shake }}
        className={cn(
          "group/conjure-button relative inline-grid h-11 cursor-pointer place-items-center overflow-clip rounded-full border bg-surface-2 px-5 text-sm font-medium text-foreground outline-none select-none",
          "transition-colors duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Hover only answers when a press would do something; while the
          // host works the border keeps the swarm's colour.
          working
            ? cn("cursor-progress", WORKING_BORDER[palette])
            : status === "error"
              ? "border-danger/50 enabled:hover:border-danger"
              : "border-hairline-strong enabled:hover:border-ink-3",
        )}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: motionSafe ? "50%" : "100%",
            backgroundImage: BAND[palette] ?? BAND.aurora,
            x: bandX,
            opacity: bandOpacity,
          }}
        />
        <span ref={setStack} aria-hidden className="grid place-items-center">
          {FACES.map((face) => (
            <FaceLabel
              key={face}
              face={face}
              text={texts[face]}
              phase={phases[face]}
              motionSafe={motionSafe}
              hoverTurn={face === "idle" && motionSafe}
              iconClassName={
                face === "done"
                  ? "text-success"
                  : face === "error"
                    ? "text-danger"
                    : undefined
              }
              iconStyle={face === "idle" ? { color: accent } : undefined}
            />
          ))}
        </span>
        {layout && geo && anchors ? (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            {seeds.map((seed, i) => {
              const anchor = anchors[i];
              if (!anchor) return null;
              return (
                <Particle
                  key={i}
                  seed={seed}
                  anchors={anchor}
                  geo={geo}
                  orbit={speed}
                  motionSafe={motionSafe}
                  color={particleColor(seed.mix)}
                  clock={clock}
                  gather={gather}
                  land={land}
                  burst={burst}
                  from={from}
                  to={to}
                />
              );
            })}
            <svg
              width={layout.w}
              height={layout.h}
              viewBox={`0 0 ${layout.w} ${layout.h}`}
              className="absolute inset-0"
              fill="none"
            >
              <Spark at={layout.faces.done.icon} spark={spark} color={accent} />
            </svg>
          </span>
        ) : null}
      </motion.button>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </span>
  );
}
