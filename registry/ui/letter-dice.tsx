"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LetterDiceElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type LetterDiceTrigger = "mount" | "inView" | "manual";

export type LetterDiceFelt = "green" | "navy" | "wine" | "slate";

export type LetterDiceProps = {
  /** The words, one per throw, cycled. */
  words: string[];
  /** The element that carries the current word. @default "p" */
  as?: LetterDiceElement;
  /** How hard the set is thrown, 0.25 to 1.5: more roll, more hops, more spin. @default 0.8 */
  tumble?: number;
  /** How scattered the throw is, 0 (a tidy line) to 1 (dice everywhere, landing at odd times). @default 0.4 */
  spread?: number;
  /** The felt. @default "green" */
  feltTone?: LetterDiceFelt;
  /** The dice, any CSS colour. Ivory by default, the same in both themes. */
  dieColor?: string;
  /** The letters on the dice, any CSS colour. Deep ink by default. */
  inkColor?: string;
  /** A die's edge, em. @default 1.3 */
  size?: number;
  /** The last die rocks on an edge before it lies still. @default true */
  rock?: boolean;
  /** Engraved slots with each letter faintly printed in them. @default true */
  slots?: boolean;
  /** What throws the first time. @default "inView" */
  trigger?: LetterDiceTrigger;
  /** With trigger "manual": each change to true throws. @default false */
  play?: boolean;
  /** Wait before the first throw, ms. @default 0 */
  delay?: number;
  /** A press, a flick across the felt, Enter or Space throws again. @default true */
  interactive?: boolean;
  /** Clacks for the throws the visitor makes. Off unless asked for. @default false */
  sound?: boolean;
  /** A throw began: the index of the word it will land on. */
  onThrow?: (index: number) => void;
  /** Every die is at rest: the index of the word showing. */
  onComplete?: (index: number) => void;
  className?: string;
};

// Felt and dice are materials: fixed pigments that read the same on either
// page.
const FELTS: Record<LetterDiceFelt, string> = {
  green: "oklch(0.43 0.075 158)",
  navy: "oklch(0.34 0.06 258)",
  wine: "oklch(0.35 0.085 14)",
  slate: "oklch(0.42 0.014 250)",
};
const IVORY = "oklch(0.965 0.014 88)";
const INK = "oklch(0.27 0.03 262)";

/** Felt fibre as an SVG noise tile: fixed art, the same in both themes. */
const FIBRE = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1 0.8' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -1.4 0.62'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

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

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/** The recoil calibration as a decaying rock: a die settling off an edge. */
const RECOIL_W = Math.sqrt(springs.recoil.stiffness / springs.recoil.mass);
const RECOIL_Z =
  springs.recoil.damping /
  (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));
const RECOIL_WD = RECOIL_W * Math.sqrt(1 - RECOIL_Z * RECOIL_Z);
/** Rocking is slower than a stamp: the same ratio at a third of the rate. */
const ROCK_RATE = 0.34;
const rockAt = (t: number) => {
  if (t <= 0) return 0;
  const s = t * ROCK_RATE;
  return Math.exp(-RECOIL_Z * RECOIL_W * s) * Math.sin(RECOIL_WD * s);
};
const ROCK_END = 4 / (RECOIL_Z * RECOIL_W * ROCK_RATE);

/* Face normals, die-local, in CSS axes (y down, z toward the viewer). */
const NORMALS: [number, number, number][] = [
  [0, 0, 1],
  [0, 0, -1],
  [1, 0, 0],
  [-1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
];
const FACE_TRANSFORMS = [
  "translateZ(0.5em)",
  "rotateY(180deg) translateZ(0.5em)",
  "rotateY(90deg) translateZ(0.5em)",
  "rotateY(-90deg) translateZ(0.5em)",
  "rotateX(90deg) translateZ(0.5em)",
  "rotateX(-90deg) translateZ(0.5em)",
];
/** The lamp: up, left and toward the viewer. */
const LIGHT = (() => {
  const v = [-0.35, -0.5, 0.8];
  const m = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  return v.map((x) => x / m) as [number, number, number];
})();

type Die = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  z: MotionValue<number>;
  rx: MotionValue<number>;
  ry: MotionValue<number>;
  rz: MotionValue<number>;
  opacity: MotionValue<number>;
  shade: MotionValue<number>[];
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  ss: MotionValue<number>;
  so: MotionValue<number>;
  /** The other five faces' letters: what flashes by as it tumbles. */
  faces: string[];
};

type Path = {
  /** Start offset from the slot, px, and when it lands, s. */
  x0: number;
  y0: number;
  land: number;
  /** Bounce schedule: touchdown times and the hop heights between them. */
  downs: number[];
  hops: number[];
  z0: number;
  roll: number;
  spin: number;
  rocks: boolean;
  sounded: number;
};

type Deal = {
  n: number;
  index: number;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function DieFace({
  char,
  index,
  shade,
  dieColor,
  inkColor,
}: {
  char: string;
  index: number;
  shade: MotionValue<number>;
  dieColor: string;
  inkColor: string;
}) {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center rounded-[16%] leading-none font-semibold [backface-visibility:hidden]"
      style={{
        transform: FACE_TRANSFORMS[index],
        backgroundColor: dieColor,
        backgroundImage:
          "radial-gradient(120% 120% at 30% 25%, oklch(1 0 0 / 0.5), transparent 55%), linear-gradient(160deg, transparent 60%, oklch(0 0 0 / 0.08))",
        boxShadow: "inset 0 0 0 0.02em oklch(0 0 0 / 0.12)",
        color: inkColor,
      }}
    >
      <span style={{ fontSize: "0.62em" }}>{char}</span>
      <motion.span
        className="absolute inset-0 rounded-[inherit] bg-black"
        style={{ opacity: shade }}
      />
    </span>
  );
}

type Api = {
  wake: () => void;
  halt: () => void;
  start: () => void;
  measure: () => void;
  throwAgain: (visitor: boolean, power?: number) => void;
};

/**
 * A word rolled in letter dice. Each letter is an ivory cube with a glyph on
 * every face, sitting in its own engraved slot on a felt strip. On the
 * trigger the set is thrown in over the left rail and tumbles in real 3D —
 * rolled a quarter turn for every side length it travels, hopping on bounces
 * that die away, spun about the vertical — and every die comes to rest square
 * in its slot with the right letter face up, the last one rocking on an edge
 * (the recoil calibration, slowed) before it lies still.
 *
 * Each die's path is seeded per throw and defined backwards from its rest
 * pose, so it always lands true; its faces are shaded from their real
 * normals against a top-left lamp every frame, and a soft contact shadow
 * shrinks and darkens as it comes down. `tumble` scales how hard the set is
 * thrown and `spread` how scattered it is; each throw lands on the next word.
 *
 * The felt is a real button: a press throws, a flick across it throws as hard
 * as it was flicked, and Enter or Space throws again. The current word is the
 * heading's text. One loop runs only during a throw; nothing runs at rest or
 * off screen. Under reduced motion the dice fade into their slots face up and
 * the last one does not rock.
 */
export function LetterDice({
  words,
  as = "p",
  tumble = 0.8,
  spread = 0.4,
  feltTone = "green",
  dieColor = IVORY,
  inkColor = INK,
  size = 1.3,
  rock = true,
  slots = true,
  trigger = "inView",
  play = false,
  delay = 0,
  interactive = true,
  sound = false,
  onThrow,
  onComplete,
  className,
}: LetterDiceProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = React.useMemo(() => {
    const clean = words.map((w) => w.trim()).filter(Boolean);
    return clean.length ? clean : [""];
  }, [words]);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [deal, setDeal] = React.useState<Deal>({ n: 0, index: 0 });
  const [fit, setFit] = React.useState(1);
  const word = list[deal.index % list.length] ?? "";
  const chars = React.useMemo(() => graphemes(word), [word]);
  const edge = clamp(size, 0.6, 3);
  const felt = FELTS[feltTone] ?? FELTS.green;

  const dice = React.useMemo(() => {
    const rand = lcg(hash(`${word}:${deal.n}`));
    return chars.map((ch): Die => {
      const pick = () => ALPHABET[Math.floor(rand() * 26)] ?? "A";
      const up = ch.toUpperCase();
      const lower = ch !== up;
      const other = () => (lower ? pick().toLowerCase() : pick());
      return {
        x: motionValue(0),
        y: motionValue(0),
        z: motionValue(0),
        rx: motionValue(0),
        ry: motionValue(0),
        rz: motionValue(0),
        opacity: motionValue(deal.n === 0 ? 1 : 0),
        shade: NORMALS.map((_, f) => motionValue(f === 0 ? 0 : 0.3)),
        sx: motionValue(0),
        sy: motionValue(0),
        ss: motionValue(1),
        so: motionValue(deal.n === 0 ? 0.36 : 0),
        faces: [ch, other(), other(), other(), other(), other()],
      };
    });
  }, [chars, word, deal.n]);
  const [persp] = React.useState(() => motionValue(400));

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const rowRef = React.useRef<HTMLSpanElement | null>(null);
  const slotNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const paths = React.useRef<(Path | null)[]>([]);
  const clock = React.useRef({ t: 0, end: 0, on: false, visitor: false });
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const strength = React.useRef(1);
  const fades = React.useRef<AnimationPlaybackControls[]>([]);
  const lift = React.useRef<number | null>(null);
  const settle = React.useRef<number | null>(null);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    tumble,
    spread,
    rock,
    edge,
    motionSafe,
    deal,
    count: list.length,
    audio,
    onThrow,
    onComplete,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };
  const stopFades = () => {
    for (const f of fades.current) f.stop();
    fades.current = [];
  };

  /** The row's natural width against the felt's: the dice shrink to fit. */
  const measure = () => {
    const root = rootRef.current;
    const row = rowRef.current;
    if (!root || !row) return;
    const em = parseFloat(getComputedStyle(row).fontSize) || 16;
    persp.set(Math.round(em * cfg.current.edge * 7));
    const room = root.clientWidth - em * 0.6;
    const need = row.scrollWidth;
    if (need <= 0) return;
    const next = r3(clamp((room / need) * fit, 0.3, 1));
    setFit((prev) => (Math.abs(prev - next) < 0.01 ? prev : next));
  };

  /** One die's pose at time t of the throw. */
  const poseOf = (p: Path, t: number, s: number) => {
    const u = clamp01(t / p.land);
    // Friction: fast in, slowing to a stop in the slot.
    const k = 1 - Math.pow(1 - u, 2.3);
    const x = p.x0 * (1 - k);
    const y = p.y0 * Math.pow(1 - u, 1.7);
    // The hops: a fall from the throw's height, then bounces that die away.
    let z = 0;
    let prev = 0;
    for (let h = 0; h < p.downs.length; h += 1) {
      const down = p.downs[h] ?? 0;
      if (t <= down) {
        const span = down - prev;
        const v = span > 0 ? (t - prev) / span : 1;
        if (h === 0) z = p.z0 * (1 - v * v);
        else z = (p.hops[h] ?? 0) * 4 * v * (1 - v);
        break;
      }
      prev = down;
    }
    // Rolled a quarter turn per side length, spun, landing square.
    let ry = (x / s) * 90 * p.roll;
    const rx = -(y / s) * 90 * p.roll;
    const rz = p.spin * Math.pow(1 - u, 2);
    if (p.rocks && t > p.land) {
      // Rocking on an edge lifts the die's centre as it tips.
      const a = 24 * rockAt(t - p.land);
      ry += a;
      const r = (Math.abs(a) * Math.PI) / 180;
      z = (s / 2) * (Math.cos(r) + Math.sin(r) - 1);
    }
    return { x, y, z, rx, ry, rz };
  };

  /** Face shading from the real normals: R = Rx · Ry · Rz, as CSS composes. */
  const shadeFaces = (die: Die, rx: number, ry: number, rz: number) => {
    const a = (rx * Math.PI) / 180;
    const b = (ry * Math.PI) / 180;
    const c = (rz * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const cc = Math.cos(c);
    const sc = Math.sin(c);
    const rest = LIGHT[2];
    for (let f = 0; f < 6; f += 1) {
      const nrm = NORMALS[f] as [number, number, number];
      // Rz
      let x = nrm[0] * cc - nrm[1] * sc;
      let y = nrm[0] * sc + nrm[1] * cc;
      let z = nrm[2];
      // Ry
      const x2 = x * cb + z * sb;
      z = -x * sb + z * cb;
      x = x2;
      // Rx
      const y2 = y * ca - z * sa;
      z = y * sa + z * ca;
      y = y2;
      const d = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2];
      die.shade[f]?.set(r3(clamp((rest - d) / rest, 0, 1) * 0.55));
    }
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const c = cfg.current;
    const ck = clock.current;
    if (!ck.on) return;
    ck.t += dt;
    const t = ck.t;
    const root = rootRef.current;
    const row = rowRef.current;
    const em = row ? parseFloat(getComputedStyle(row).fontSize) || 16 : 16;
    const s = em * c.edge;
    dice.forEach((die, i) => {
      const p = paths.current[i];
      if (!p) return;
      const pose = poseOf(p, t, s);
      die.x.set(r2(pose.x));
      die.y.set(r2(pose.y));
      die.z.set(r2(pose.z));
      die.rx.set(r2(pose.rx));
      die.ry.set(r2(pose.ry));
      die.rz.set(r2(pose.rz));
      if (t > 0 && die.opacity.get() < 1) die.opacity.set(1);
      shadeFaces(die, pose.rx, pose.ry, pose.rz);
      // The shadow sits under the die, pushed down-right by its height.
      const lift = clamp01(pose.z / (s * 1.4));
      die.sx.set(r2(pose.x + pose.z * 0.35 + s * 0.05));
      die.sy.set(r2(pose.y + pose.z * 0.5 + s * 0.07));
      die.ss.set(r3(1 + lift * 0.4));
      die.so.set(r3(0.36 * (1 - lift * 0.85)));
      // A clack at every touchdown the visitor's throw makes.
      if (ck.visitor && p.sounded < p.downs.length) {
        const down = p.downs[p.sounded] ?? Infinity;
        if (t >= down) {
          p.sounded += 1;
          const rect = slotNodes.current.get(i)?.getBoundingClientRect();
          c.audio.play("clack", {
            pitch: r2(0.85 + ((hash(`${i}:${c.deal.n}`) % 100) / 100) * 0.4),
            gain: r2(Math.max(0.12, 0.5 - p.sounded * 0.12)),
            pan: rect && root ? panFrom(rect.left + rect.width / 2, root) : 0,
          });
        }
      }
    });
    if (t >= ck.end) {
      ck.on = false;
      dice.forEach((die) => {
        die.x.set(0);
        die.y.set(0);
        die.z.set(0);
        die.rx.set(0);
        die.ry.set(0);
        die.rz.set(0);
        shadeFaces(die, 0, 0, 0);
        die.sx.set(r2(s * 0.05));
        die.sy.set(r2(s * 0.07));
        die.ss.set(1);
        die.so.set(0.36);
      });
      c.onComplete?.(c.deal.index);
      return;
    }
    if (live.current) {
      raf.current = window.requestAnimationFrame((x) => frameRef.current(x));
    }
  };

  /** Seeds every die's path for this throw and starts the clock. */
  const start = () => {
    const c = cfg.current;
    const root = rootRef.current;
    const row = rowRef.current;
    halt();
    stopFades();
    if (!root || !row) return;
    c.onThrow?.(c.deal.index);
    if (!c.motionSafe) {
      // Still: the dice settle into their slots, one after another.
      const step = cascade(dice.length);
      const em = parseFloat(getComputedStyle(row).fontSize) || 16;
      const edgePx = em * c.edge;
      fades.current = dice.flatMap((die, i) => {
        const tween = {
          duration: durations.base,
          ease: easings.enter,
          delay: i * step,
        };
        die.sx.set(r2(edgePx * 0.05));
        die.sy.set(r2(edgePx * 0.07));
        return [animate(die.opacity, 1, tween), animate(die.so, 0.36, tween)];
      });
      paths.current = [];
      clock.current.on = false;
      if (settle.current !== null) window.clearTimeout(settle.current);
      settle.current = window.setTimeout(
        () => {
          settle.current = null;
          cfg.current.onComplete?.(cfg.current.deal.index);
        },
        Math.round((dice.length * step + durations.base) * 1000),
      );
      return;
    }
    const em = parseFloat(getComputedStyle(row).fontSize) || 16;
    const s = em * c.edge;
    const rect = root.getBoundingClientRect();
    const rand = lcg(hash(`${c.deal.n}:${c.deal.index}:throw`));
    const power = clamp(c.tumble, 0.25, 1.5) * strength.current;
    const scatter = clamp01(c.spread);
    const room = Math.max(0, (root.clientHeight - s) / 2 - s * 0.08);
    let end = 0;
    let lastLand = -1;
    let lastIndex = -1;
    const next: (Path | null)[] = dice.map((_, i) => {
      const slot = slotNodes.current.get(i);
      if (!slot) return null;
      const r = slot.getBoundingClientRect();
      const fromLeft = r.left - rect.left;
      const x0 = -(fromLeft + s * (1.3 + rand() * 0.8));
      const y0 = (rand() * 2 - 1) * room * (0.25 + 0.75 * scatter);
      const land =
        (0.72 + 0.22 * Math.min(1.5, power)) *
          (0.9 + (rand() - 0.5) * 0.5 * scatter) +
        i * (0.03 + 0.05 * scatter * rand());
      // The fall from the throw, then hops at 40% of the last height each.
      const z0 = s * (0.45 + 0.5 * Math.min(1.5, power));
      const heights = [z0];
      while (heights.length < 6) {
        const h = (heights[heights.length - 1] ?? 0) * 0.4;
        if (h < s * 0.04) break;
        heights.push(h);
      }
      const spans = heights.map((h, k) =>
        k === 0 ? Math.sqrt(h) : 2 * Math.sqrt(h),
      );
      const total = spans.reduce((a, b) => a + b, 0);
      const airTime = land * 0.86;
      const downs: number[] = [];
      let acc = 0;
      for (const span of spans) {
        acc += (span / total) * airTime;
        downs.push(acc);
      }
      if (land > lastLand) {
        lastLand = land;
        lastIndex = i;
      }
      end = Math.max(end, land);
      return {
        x0,
        y0,
        land,
        downs,
        hops: heights,
        z0,
        roll: 0.45 + 0.4 * Math.min(1.5, power),
        spin: (rand() < 0.5 ? -1 : 1) * (90 + 260 * rand()) * power,
        rocks: false,
        sounded: 0,
      };
    });
    const lastPath = next[lastIndex];
    if (lastPath && c.rock) {
      lastPath.rocks = true;
      end = Math.max(end, lastPath.land + ROCK_END);
    }
    paths.current = next;
    clock.current.t = 0;
    clock.current.end = end + 0.05;
    clock.current.on = true;
    dice.forEach((die, i) => {
      const p = next[i];
      if (!p) return;
      const pose = poseOf(p, 0, s);
      die.x.set(r2(pose.x));
      die.y.set(r2(pose.y));
      die.z.set(r2(pose.z));
      die.opacity.set(1);
    });
    wake();
  };

  /** The visitor throws: the dice lift off, and the next word is rolled. */
  const throwAgain = (visitor: boolean, power = 1) => {
    const c = cfg.current;
    strength.current = clamp(power, 0.4, 1.6);
    clock.current.visitor = visitor;
    halt();
    stopFades();
    if (lift.current !== null) window.clearTimeout(lift.current);
    fades.current = dice.flatMap((die) => [
      animate(die.opacity, 0, { duration: 0.12, ease: easings.exit }),
      animate(die.so, 0, { duration: 0.12, ease: easings.exit }),
    ]);
    lift.current = window.setTimeout(() => {
      lift.current = null;
      setDeal((d) => ({
        n: d.n + 1,
        index: d.n === 0 && !visitor ? d.index : (d.index + 1) % c.count,
      }));
    }, 130);
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      tumble,
      spread,
      rock,
      edge,
      motionSafe,
      deal,
      count: list.length,
      audio,
      onThrow,
      onComplete,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, start, measure, throwAgain };
  });

  // A new deal is thrown as soon as its dice are on the page.
  React.useLayoutEffect(() => {
    api.current?.measure();
    if (deal.n > 0) api.current?.start();
  }, [deal]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [fit, edge, list]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
  }, [running]);

  React.useEffect(() => {
    const anims = fades;
    return () => {
      api.current?.halt();
      for (const f of anims.current) f.stop();
      if (lift.current !== null) window.clearTimeout(lift.current);
      lift.current = null;
      if (settle.current !== null) window.clearTimeout(settle.current);
      settle.current = null;
    };
  }, []);

  // The first throw, on the trigger.
  const thrown = React.useRef(false);
  const startTimer = React.useRef<number | null>(null);
  const begin = React.useCallback(
    (again: boolean) => {
      if (thrown.current && !again) return;
      thrown.current = true;
      if (startTimer.current !== null) window.clearTimeout(startTimer.current);
      startTimer.current = window.setTimeout(
        () => {
          startTimer.current = null;
          api.current?.throwAgain(false);
        },
        Math.max(0, delay),
      );
    },
    [delay],
  );

  React.useEffect(() => {
    if (trigger === "mount") begin(false);
    if (trigger === "manual" && play) begin(true);
    return () => {
      if (startTimer.current !== null) window.clearTimeout(startTimer.current);
      startTimer.current = null;
      // A throw the cleanup cancelled has not happened yet.
      if (trigger !== "inView") thrown.current = false;
    };
  }, [trigger, play, begin]);

  const seen = React.useRef(trigger);
  React.useLayoutEffect(() => {
    seen.current = trigger;
  });

  const bindRoot = React.useCallback(
    (node: HTMLButtonElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const remeasure = () => api.current?.measure();
      const sizer = new ResizeObserver(remeasure);
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", remeasure);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        if (seen.current === "inView" && visible) begin(false);
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        document.fonts?.removeEventListener?.("loadingdone", remeasure);
      };
    },
    [begin],
  );

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: !interactive,
    onEnd: ({ velocity }) => {
      // A flick throws as hard as it was flicked.
      const v = Math.abs(velocity.x);
      throwAgain(true, v > 250 ? v / 1100 : 1);
    },
    onTap: () => throwAgain(true),
  });

  const Tag = as;

  return (
    <div className={cn("relative w-full", className)}>
      <Tag className="sr-only">{word}</Tag>
      <button
        ref={bindRoot}
        type="button"
        aria-label="Throw the dice"
        aria-describedby={hintId}
        disabled={!interactive}
        onClick={(event) => {
          // Pointer throws arrive through the drag; Enter and Space here.
          if (event.detail === 0) throwAgain(true);
        }}
        {...drag}
        className={cn(
          "relative block w-full touch-pan-y overflow-clip rounded-3 px-[0.5em] py-[0.42em] outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          interactive ? "cursor-pointer" : "cursor-default",
        )}
        style={{
          backgroundColor: felt,
          backgroundImage: `radial-gradient(120% 140% at 50% 40%, oklch(1 0 0 / 0.07), transparent 60%), ${FIBRE}`,
          backgroundSize: "auto, 140px 140px",
          boxShadow:
            "inset 0 0 0 0.06em oklch(0 0 0 / 0.28), inset 0 0.12em 0.3em oklch(0 0 0 / 0.35), inset 0 -0.04em 0.1em oklch(1 0 0 / 0.08)",
        }}
      >
        <span
          ref={rowRef}
          aria-hidden
          className="relative mx-auto flex w-fit items-center justify-center"
          style={{ fontSize: `${fit}em`, gap: `${r3(edge * 0.16)}em` }}
        >
          {chars.map((ch, i) => {
            const die = dice[i];
            if (/\s/.test(ch) || !die) {
              return (
                <span
                  key={`${deal.n}:${i}`}
                  className="block shrink-0"
                  style={{ width: `${r3(edge * 0.3)}em` }}
                />
              );
            }
            return (
              <span
                key={`${deal.n}:${i}`}
                ref={(node) => {
                  if (node) slotNodes.current.set(i, node);
                  else slotNodes.current.delete(i);
                }}
                className="relative block shrink-0"
                style={{ width: `${r3(edge)}em`, height: `${r3(edge)}em` }}
              >
                {slots ? (
                  <span
                    className="absolute -inset-[0.06em] flex items-center justify-center rounded-[18%] leading-none font-semibold"
                    style={{
                      boxShadow:
                        "inset 0 0.04em 0.08em oklch(0 0 0 / 0.4), inset 0 -0.02em 0.04em oklch(1 0 0 / 0.08)",
                      background: "oklch(0 0 0 / 0.1)",
                      color: "oklch(1 0 0 / 0.16)",
                      fontSize: `${r3(edge * 0.62)}em`,
                    }}
                  >
                    {ch}
                  </span>
                ) : null}
                <motion.span
                  className="absolute inset-[8%] rounded-[30%] bg-black blur-[0.08em]"
                  style={{
                    x: die.sx,
                    y: die.sy,
                    scale: die.ss,
                    opacity: die.so,
                  }}
                />
                <motion.span
                  className="absolute inset-0 block"
                  style={{
                    fontSize: `${r3(edge)}em`,
                    x: die.x,
                    y: die.y,
                    z: die.z,
                    rotateX: die.rx,
                    rotateY: die.ry,
                    rotateZ: die.rz,
                    opacity: die.opacity,
                    transformPerspective: persp,
                    transformStyle: "preserve-3d",
                  }}
                >
                  {die.faces.map((face, f) => (
                    <DieFace
                      key={f}
                      char={face}
                      index={f}
                      shade={die.shade[f] as MotionValue<number>}
                      dieColor={dieColor}
                      inkColor={inkColor}
                    />
                  ))}
                </motion.span>
              </span>
            );
          })}
        </span>
      </button>
      <span id={hintId} className="sr-only">
        Enter or Space throws again; flick the felt to throw harder.
      </span>
    </div>
  );
}
