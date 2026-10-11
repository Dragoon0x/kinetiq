"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BuntingLineShape = "pennant" | "swallow" | "square" | "scallop";
export type BuntingLineElement = "h1" | "h2" | "h3" | "p" | "div";

export type BuntingLineProps = {
  /** The headline, a letter to a flag; `\n` hangs another string below. */
  text: string;
  /** The element rendered. @default "h2" */
  as?: BuntingLineElement;
  /** How deep the string hangs between its pegs, 0 (taut) to 1. @default 0.5 */
  sag?: number;
  /** The breeze, 0 (still air) to 1: the flags' lean, the gusts and their flutter. @default 0.4 */
  wind?: number;
  /** The cut of the flags. @default "pennant" */
  flagShape?: BuntingLineShape;
  /** Flag cloth, in order along the string. @default five pigments from the tokens */
  colors?: string[];
  /** The printed letters. @default a cream pigment */
  letterColor?: string;
  /** The string and its pegs. @default "var(--ink-3)" */
  stringColor?: string;
  /** How taut the string is, 0 to 1: a pluck runs faster along a tauter string. @default 0.5 */
  tension?: number;
  /** How long a pluck rings, 0 (dead) to 1 (long). @default 0.5 */
  ring?: number;
  /** Palette order and flutter phases. @default 1 */
  seed?: number;
  /** The pointer and the keys pluck the string. @default true */
  interactive?: boolean;
  /** Nothing plucks. @default false */
  disabled?: boolean;
  /** Still air; a pluck still rings. @default false */
  paused?: boolean;
  /** A pluck: where along the string, 0 (left peg) to 1 (right peg). */
  onPluck?: (at: number) => void;
  className?: string;
};

/** The design space's width: everything scales with the element. */
const W = 1000;
/** Peg inset from either side. */
const PAD = 16;
/** Nodes along each string. */
const NODES = 48;
/** Room above the pegs, and below the flags for their swing. */
const TOP = 30;
const FOOT = 34;
/** How far below its rest the string is drawn at most, so flags stay in the frame. */
const DIP = FOOT - 8;

/** Soft saturation of a downward displacement at DIP; upward is free. */
const dip = (w: number) => (w > 0 ? DIP * Math.tanh(w / DIP) : w);
/** Flag height for its width, per cut. */
const RATIO: Record<BuntingLineShape, number> = {
  pennant: 1.22,
  swallow: 1.12,
  square: 0.98,
  scallop: 1.08,
};
/** The letter's size for the flag's width, per cut: a pennant narrows fast. */
const LETTER_SIZE: Record<BuntingLineShape, number> = {
  pennant: 0.42,
  swallow: 0.5,
  square: 0.54,
  scallop: 0.5,
};
/** Where the letter sits down the flag, per cut. */
const LETTER_AT: Record<BuntingLineShape, number> = {
  pennant: 0.34,
  swallow: 0.4,
  square: 0.47,
  scallop: 0.42,
};

const PALETTE = [
  "oklch(from var(--accent) 0.56 0.15 h)",
  "oklch(from var(--danger) 0.6 0.15 h)",
  "oklch(from var(--warn) 0.68 0.13 h)",
  "oklch(from var(--success) 0.58 0.1 h)",
  "oklch(from var(--accent) 0.4 0.09 h)",
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Splits text into graphemes, so emoji and combining marks stay whole. */
function graphemes(text: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (!Segmenter) return Array.from(text);
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (s) => s.segment,
  );
}

function shapePath(shape: BuntingLineShape, w: number, h: number): string {
  const x = r2(w / 2);
  const y = r2(h);
  switch (shape) {
    case "swallow":
      return `M ${-x} 0 L ${x} 0 L ${x} ${y} L 0 ${r2(h * 0.7)} L ${-x} ${y} Z`;
    case "square":
      return `M ${-x} 0 L ${x} 0 L ${x} ${r2(h * 0.92)} Q 0 ${r2(h * 1.05)} ${-x} ${r2(h * 0.92)} Z`;
    case "scallop":
      return `M ${-x} 0 L ${x} 0 L ${x} ${r2(h * 0.56)} A ${x} ${r2(h * 0.44)} 0 0 1 ${-x} ${r2(h * 0.56)} Z`;
    default:
      return `M ${-x} 0 L ${x} 0 L 0 ${y} Z`;
  }
}

type Flag = {
  char: string;
  /** Where it hangs, 0–1 along its string. */
  u: number;
  colour: number;
  line: number;
};

type Line = {
  flags: number[];
  top: number;
  sag: number;
  fw: number;
  fh: number;
};

type Layout = { flags: Flag[]; lines: Line[]; height: number };

function layoutOf(
  text: string,
  sag: number,
  shape: BuntingLineShape,
  seed: number,
  palette: number,
): Layout {
  const flags: Flag[] = [];
  const lines: Line[] = [];
  let y = 0;
  const rows = text
    .split("\n")
    .map((row) => row.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  let colour = Math.abs(Math.round(seed)) % Math.max(1, palette);
  rows.forEach((row, l) => {
    const chars = graphemes(row);
    // A space is a gap a little narrower than a flag.
    const slots = chars.reduce((n, c) => n + (c === " " ? 0.6 : 1), 0);
    const span = W - PAD * 2;
    const pitch = span / Math.max(slots + 0.6, 1);
    const fw = Math.min(110, pitch * 0.88);
    const fh = fw * RATIO[shape];
    const sagDepth = sag * 110;
    const top = y + TOP;
    const line: Line = { flags: [], top, sag: sagDepth, fw, fh };
    let at = pitch * 0.3;
    chars.forEach((char) => {
      const width = char === " " ? 0.6 : 1;
      if (char !== " ") {
        line.flags.push(flags.length);
        flags.push({
          char,
          u: (at + (pitch * width) / 2) / span,
          colour,
          line: l,
        });
        colour = (colour + 1) % Math.max(1, palette);
      }
      at += pitch * width;
    });
    lines.push(line);
    y = top + sagDepth + fh + FOOT;
  });
  return { flags, lines, height: Math.max(40, Math.round(y)) };
}

/** The string's resting height at u along it. */
const restY = (line: Line, u: number) => line.top + line.sag * 4 * u * (1 - u);
/** And its resting slope, design units down per unit across. */
const restSlope = (line: Line, u: number) =>
  (line.sag * 4 * (1 - 2 * u)) / (W - PAD * 2);

type Sim = {
  /** Per string: displacement and velocity of each node, fixed ends excluded. */
  w: Float64Array[];
  v: Float64Array[];
  /** Per flag: sway (deg) and swing, with their velocities. */
  sway: Float64Array;
  swayV: Float64Array;
  swing: Float64Array;
  swingV: Float64Array;
  /** The string's vertical velocity under each flag last step, for its acceleration. */
  lastV: Float64Array;
  /** Reduced motion's brightness wave: when it started and where. */
  flash: { at: number; u: number; line: number };
  pin: { line: number; node: number; to: number } | null;
  t: number;
  last: number;
  marker: { line: number; flag: number };
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  tick: (now: number) => void;
  kick: () => void;
  draw: () => void;
};

/**
 * A headline strung across the frame as bunting: each letter printed on a
 * cloth flag sewn along a string that sags between two pegs. The string is a
 * real string — forty-eight nodes under the wave equation, fixed at the pegs
 * and damped — and the flags ride it: their top edges follow its slope, and
 * each swings and sways on its own pair of damped oscillators, driven by the
 * string's acceleration and by the breeze, a steady lean plus gusts that run
 * along the line so the flags flutter one after another.
 *
 * Pluck it: press near the string and pull, and it follows the pointer 1:1
 * as a kink; let go and the kink splits into two waves that run out to both
 * pegs, reflect and come back, every flag jolting as they pass. A tap plucks
 * with a flick, the mouse brushing across the string strums it, and Space or
 * Enter plucks at the keyboard's marker, which Left and Right move from flag
 * to flag. The drawing lives in a design space a thousand units wide, so the
 * server's frame is exact at any width. Under reduced motion the flags hang
 * still and a pluck sends a wave of light, not motion, along them.
 */
export function BuntingLine({
  text,
  as = "h2",
  sag = 0.5,
  wind = 0.4,
  flagShape = "pennant",
  colors = PALETTE,
  letterColor = "oklch(0.985 0.012 90)",
  stringColor = "var(--ink-3)",
  tension = 0.5,
  ring = 0.5,
  seed = 1,
  interactive = true,
  disabled = false,
  paused = false,
  onPluck,
  className,
}: BuntingLineProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [onScreen, setOnScreen] = React.useState(false);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const live = interactive && !disabled;
  const palette = colors.length ? colors : PALETTE;
  const shape: BuntingLineShape = RATIO[flagShape] ? flagShape : "pennant";
  const s = clamp01(sag);
  const air = paused ? 0 : clamp01(wind);

  const layout = React.useMemo(
    () => layoutOf(text, s, shape, seed, palette.length),
    [text, s, shape, seed, palette.length],
  );
  const { flags, lines, height } = layout;

  const rootRef = React.useRef<HTMLElement | null>(null);
  const strings = React.useRef<(SVGPathElement | null)[]>([]);
  const flagRefs = React.useRef<(SVGGElement | null)[]>([]);
  const shades = React.useRef<(SVGRectElement | null)[]>([]);
  const lights = React.useRef<(SVGRectElement | null)[]>([]);
  const markerRef = React.useRef<SVGPathElement | null>(null);
  const frame = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPluck);
  const loopCb = React.useCallback((now: number) => api.current?.tick(now), []);

  const makeSim = (l: Layout, startLean: number): Sim => ({
    w: l.lines.map(() => new Float64Array(NODES)),
    v: l.lines.map(() => new Float64Array(NODES)),
    // Flags start where the server drew them: leaning in the breeze.
    sway: new Float64Array(l.flags.length).fill(startLean),
    swayV: new Float64Array(l.flags.length),
    swing: new Float64Array(l.flags.length),
    swingV: new Float64Array(l.flags.length),
    lastV: new Float64Array(l.flags.length),
    flash: { at: -99, u: 0.5, line: 0 },
    pin: null,
    t: 0,
    last: 0,
    marker: { line: 0, flag: Math.floor((l.lines[0]?.flags.length ?? 1) / 2) },
  });
  /** The lean the breeze holds a flag at, degrees of sway. */
  const lean = (wind: number) => wind * 16;
  // The server's frame: the string at rest, the flags leaning in the breeze.
  const restLean = r2(lean(air) * (motionSafe ? 0.6 : 0.4));
  const sim = React.useRef<Sim>(makeSim(layout, restLean));
  const simFor = React.useRef(layout);

  const nodeX = (j: number) => PAD + ((W - PAD * 2) * (j + 1)) / (NODES + 1);

  /** A string's displacement and slope at u, from its nodes. */
  const sample = (w: Float64Array, u: number) => {
    const f = clamp(u, 0, 1) * (NODES + 1) - 1;
    const j = Math.floor(f);
    const at = (k: number) => (k < 0 || k >= NODES ? 0 : (w[k] ?? 0));
    const a = at(j);
    const b = at(j + 1);
    const dx = (W - PAD * 2) / (NODES + 1);
    return { y: lerp(a, b, f - j), slope: (b - a) / dx };
  };

  /** Writes the frame: each string's path, each flag's transform and shading. */
  const draw = () => {
    const st = sim.current;
    lines.forEach((line, l) => {
      const path = strings.current[l];
      const w = st.w[l];
      if (!path || !w) return;
      let d = `M ${PAD} ${r2(restY(line, 0))}`;
      for (let j = 0; j < NODES; j += 1) {
        const x = nodeX(j);
        const u = (x - PAD) / (W - PAD * 2);
        d += ` L ${r2(x)} ${r2(restY(line, u) + dip(w[j] ?? 0))}`;
      }
      d += ` L ${W - PAD} ${r2(restY(line, 1))}`;
      path.setAttribute("d", d);
    });
    const flashAge = st.t - st.flash.at;
    flags.forEach((flag, i) => {
      const g = flagRefs.current[i];
      const line = lines[flag.line];
      const w = st.w[flag.line];
      if (!g || !line || !w) return;
      const at = sample(w, flag.u);
      const x = PAD + (W - PAD * 2) * flag.u;
      const y = restY(line, flag.u) + dip(at.y) + 1.5;
      const slope = restSlope(line, flag.u) + at.slope;
      const angle = ((Math.atan(slope) * 180) / Math.PI) * 0.85;
      const swing = st.swing[i] ?? 0;
      const k = Math.cos(clamp(swing, -1.2, 1.2));
      const sway = motionSafe ? (st.sway[i] ?? 0) : restLean;
      g.setAttribute(
        "transform",
        `translate(${r2(x)} ${r2(y)}) rotate(${r2(angle)}) skewX(${r2(sway)}) scale(${r2(1 - 0.05 * (1 - k))} ${r2(0.35 + 0.65 * k)})`,
      );
      shades.current[i]?.setAttribute(
        "opacity",
        String(r2(clamp01(Math.sin(swing) * 0.55))),
      );
      let light = clamp01(-Math.sin(swing) * 0.45);
      if (!motionSafe && flashAge >= 0 && flashAge < 1.4) {
        const reach =
          Math.abs(flag.u - st.flash.u) +
          Math.abs(flag.line - st.flash.line) * 0.3;
        const pulse = Math.exp(-(((flashAge - reach * 0.9) / 0.13) ** 2));
        light = Math.max(light, pulse * 0.4);
      }
      lights.current[i]?.setAttribute("opacity", String(r2(light)));
    });
    const marker = markerRef.current;
    const mFlag = flags[lines[st.marker.line]?.flags[st.marker.flag] ?? -1];
    if (marker && mFlag) {
      const line = lines[mFlag.line] as Line;
      const at = sample(st.w[mFlag.line] as Float64Array, mFlag.u);
      const x = PAD + (W - PAD * 2) * mFlag.u;
      const y = restY(line, mFlag.u) + dip(at.y) - 9;
      marker.setAttribute("transform", `translate(${r2(x)} ${r2(y)})`);
    }
  };

  /** Advances the string and the flags by dt seconds. */
  const step = (dt: number) => {
    const st = sim.current;
    st.t += dt;
    if (!motionSafe) return;
    const c = lerp(1300, 3300, clamp01(tension));
    const gamma = lerp(5.5, 0.9, clamp01(ring));
    const dx = (W - PAD * 2) / (NODES + 1);
    const c2 = (c * c) / (dx * dx);
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240, (0.8 * dx) / c);
      left -= h;
      st.w.forEach((w, l) => {
        const v = st.v[l] as Float64Array;
        for (let j = 0; j < NODES; j += 1) {
          const a = j > 0 ? (w[j - 1] as number) : 0;
          const b = j < NODES - 1 ? (w[j + 1] as number) : 0;
          const acc =
            c2 * (a - 2 * (w[j] as number) + b) - gamma * (v[j] as number);
          v[j] = (v[j] as number) + acc * h;
        }
        for (let j = 0; j < NODES; j += 1) {
          w[j] = (w[j] as number) + (v[j] as number) * h;
        }
        const pin = st.pin;
        if (pin && pin.line === l) {
          w[pin.node] = pin.to;
          v[pin.node] = 0;
        }
      });
    }
    // The flags: a lean and gusts from the breeze, jolts from the string.
    const period = lerp(6, 3.6, air);
    flags.forEach((flag, i) => {
      const w = st.v[flag.line] as Float64Array;
      const vy = sample(w, flag.u).y;
      const ay = (vy - (st.lastV[i] ?? 0)) / Math.max(dt, 1e-3);
      st.lastV[i] = vy;
      const phase = (st.t / period) % 1;
      const front = phase * 1.6 - 0.3;
      const gust = air * Math.exp(-(((flag.u - front) / 0.16) ** 2));
      const jitter = Math.sin(st.t * 37.7 + i * 1.7 + seed * 0.61) * gust;
      const swayGoal =
        lean(air) * (0.6 + 0.4 * Math.min(1, gust * 2)) + jitter * 6;
      const swayA =
        -60 * ((st.sway[i] ?? 0) - swayGoal) - 5.4 * (st.swayV[i] ?? 0);
      const swingA =
        -40 * (st.swing[i] ?? 0) -
        3.2 * (st.swingV[i] ?? 0) +
        gust * 9 * Math.sin(st.t * 27 + i * 2.3 + seed * 1.13) -
        ay * 0.0016;
      st.swayV[i] = (st.swayV[i] ?? 0) + swayA * dt;
      st.sway[i] = clamp((st.sway[i] ?? 0) + (st.swayV[i] ?? 0) * dt, -40, 40);
      st.swingV[i] = (st.swingV[i] ?? 0) + swingA * dt;
      st.swing[i] = clamp(
        (st.swing[i] ?? 0) + (st.swingV[i] ?? 0) * dt,
        -1.1,
        1.1,
      );
    });
  };

  /** Whether anything still moves: the breeze, a wave, a swinging flag. */
  const moving = () => {
    const st = sim.current;
    if (st.pin) return true;
    if (!motionSafe) return st.t - st.flash.at < 1.5;
    if (air > 0) return true;
    for (let l = 0; l < st.w.length; l += 1) {
      const w = st.w[l] as Float64Array;
      const v = st.v[l] as Float64Array;
      for (let j = 0; j < NODES; j += 1) {
        if (Math.abs(w[j] as number) > 0.05 || Math.abs(v[j] as number) > 0.5) {
          return true;
        }
      }
    }
    for (let i = 0; i < flags.length; i += 1) {
      if (
        Math.abs(st.sway[i] ?? 0) > 0.05 ||
        Math.abs(st.swayV[i] ?? 0) > 0.05 ||
        Math.abs(st.swing[i] ?? 0) > 0.002 ||
        Math.abs(st.swingV[i] ?? 0) > 0.002
      ) {
        return true;
      }
    }
    return false;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const st = sim.current;
    const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 1 / 60;
    st.last = now;
    step(dt);
    draw();
    if (frame.current) return;
    if (onScreen && !hidden && moving()) {
      frame.current = window.requestAnimationFrame(loopCb);
    } else {
      st.last = 0;
    }
  };

  const kick = () => {
    if (frame.current || !onScreen || hidden) return;
    sim.current.last = 0;
    frame.current = window.requestAnimationFrame(loopCb);
  };

  /** Plucks string `l` at u: a released kink, or a flick of velocity. */
  const pluck = (l: number, u: number, how: "kink" | "flick", strength = 1) => {
    const st = sim.current;
    const line = lines[l];
    if (!line) return;
    report.current?.(r2(clamp01(u)));
    if (!motionSafe) {
      st.flash = { at: st.t, u, line: l };
      kick();
      return;
    }
    const w = st.w[l] as Float64Array;
    const v = st.v[l] as Float64Array;
    const peak = (line.fh * 0.32 + 10) * strength;
    for (let j = 0; j < NODES; j += 1) {
      const x = (nodeX(j) - PAD) / (W - PAD * 2);
      if (how === "kink") {
        // A triangle with its apex at the pluck: the shape a pulled string takes.
        const tri =
          x < u ? x / Math.max(u, 0.02) : (1 - x) / Math.max(1 - u, 0.02);
        w[j] = (w[j] as number) - peak * tri;
      } else {
        const g = Math.exp(-(((x - u) / 0.05) ** 2));
        v[j] = (v[j] as number) - peak * 14 * g;
      }
    }
    kick();
  };

  /** The string nearest a point (design units), if the point is on it or its flags. */
  const near = (x: number, y: number) => {
    const st = sim.current;
    const u = clamp01((x - PAD) / (W - PAD * 2));
    let best = -1;
    let bestD = Infinity;
    lines.forEach((line, l) => {
      const sy = restY(line, u) + sample(st.w[l] as Float64Array, u).y;
      const d = y < sy ? sy - y : Math.max(0, y - sy - line.fh * 0.6);
      if (d < 26 && d < bestD) {
        bestD = d;
        best = l;
      }
    });
    return { line: best, u };
  };

  const toDesign = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    const scale = r && r.width > 0 ? W / r.width : 1;
    return {
      x: (clientX - (r?.left ?? 0)) * scale,
      y: (clientY - (r?.top ?? 0)) * scale,
      scale,
    };
  };

  const grab = React.useRef<{ line: number; node: number; u: number } | null>(
    null,
  );
  const lastPointer = React.useRef<{ x: number; y: number } | null>(null);

  const drag = useDrag({
    threshold: 4,
    disabled: !live,
    onStart: ({ point, offset }) => {
      const p = toDesign(point.x - offset.x, point.y - offset.y);
      const hit = near(p.x, p.y);
      if (hit.line < 0 || !motionSafe) return;
      const node = clamp(Math.round(hit.u * (NODES + 1)) - 1, 0, NODES - 1);
      grab.current = { line: hit.line, node, u: hit.u };
      const w = sim.current.w[hit.line] as Float64Array;
      sim.current.pin = { line: hit.line, node, to: w[node] ?? 0 };
      kick();
    },
    onMove: ({ point }) => {
      const g = grab.current;
      const pin = sim.current.pin;
      const line = g ? lines[g.line] : undefined;
      if (!g || !pin || !line) return;
      const p = toDesign(point.x, point.y);
      // The pull is 1:1 within the frame's room and gives way past it.
      const raw = p.y - restY(line, g.u);
      const up = line.top - 6;
      pin.to =
        raw > DIP
          ? DIP + rubberband(raw - DIP, DIP * 2)
          : raw < -up
            ? -up + rubberband(raw + up, up)
            : raw;
      kick();
    },
    onEnd: () => {
      const g = grab.current;
      grab.current = null;
      if (!g) return;
      sim.current.pin = null;
      report.current?.(r2(clamp01(g.u)));
      kick();
    },
    onCancel: () => {
      grab.current = null;
      sim.current.pin = null;
      kick();
    },
    onTap: (event) => {
      const p = toDesign(event.clientX, event.clientY);
      const hit = near(p.x, p.y);
      if (hit.line >= 0) pluck(hit.line, hit.u, "flick", 0.8);
    },
  });

  /** The mouse brushing across a string strums it, gently. */
  const strum = (event: React.PointerEvent) => {
    if (!live || !motionSafe || event.pointerType !== "mouse") return;
    if (event.buttons !== 0) return;
    const p = toDesign(event.clientX, event.clientY);
    const prev = lastPointer.current;
    lastPointer.current = { x: p.x, y: p.y };
    if (!prev) return;
    const st = sim.current;
    const u = clamp01((p.x - PAD) / (W - PAD * 2));
    lines.forEach((line, l) => {
      const sy = restY(line, u) + sample(st.w[l] as Float64Array, u).y;
      if ((prev.y - sy) * (p.y - sy) >= 0) return;
      const v = st.v[l] as Float64Array;
      const speed = clamp((p.y - prev.y) * 18, -260, 260);
      for (let j = 0; j < NODES; j += 1) {
        const x = (nodeX(j) - PAD) / (W - PAD * 2);
        v[j] = (v[j] as number) + speed * Math.exp(-(((x - u) / 0.04) ** 2));
      }
      kick();
    });
  };

  const moveMarker = (by: number | "home" | "end") => {
    const st = sim.current;
    const order: { line: number; flag: number }[] = [];
    lines.forEach((line, l) =>
      line.flags.forEach((_, f) => order.push({ line: l, flag: f })),
    );
    if (!order.length) return;
    const at = order.findIndex(
      (m) => m.line === st.marker.line && m.flag === st.marker.flag,
    );
    const next =
      by === "home"
        ? 0
        : by === "end"
          ? order.length - 1
          : clamp((at < 0 ? 0 : at) + by, 0, order.length - 1);
    st.marker = order[next] as { line: number; flag: number };
    draw();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!live) return;
    const st = sim.current;
    switch (event.key) {
      case " ":
      case "Enter": {
        event.preventDefault();
        if (event.repeat) return;
        const flag = flags[lines[st.marker.line]?.flags[st.marker.flag] ?? -1];
        pluck(st.marker.line, flag?.u ?? 0.5, "kink");
        return;
      }
      case "ArrowLeft":
        moveMarker(-1);
        break;
      case "ArrowRight":
        moveMarker(1);
        break;
      case "Home":
        moveMarker("home");
        break;
      case "End":
        moveMarker("end");
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  React.useLayoutEffect(() => {
    api.current = { tick, kick, draw };
    report.current = onPluck;
  });

  // A new layout is a new string at rest; the breeze picks it up from there.
  React.useLayoutEffect(() => {
    if (simFor.current === layout) return;
    simFor.current = layout;
    sim.current = makeSim(layout, restLean);
    api.current?.draw();
    // `makeSim` reads only the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [onScreen, hidden, air, motionSafe, layout, tension, ring]);

  React.useEffect(() => {
    const loopRef = frame;
    return () => {
      if (loopRef.current) window.cancelAnimationFrame(loopRef.current);
      loopRef.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const firstMark =
    flags[lines[0]?.flags[Math.floor((lines[0]?.flags.length ?? 1) / 2)] ?? -1];
  const markerAt = firstMark
    ? `translate(${r2(PAD + (W - PAD * 2) * firstMark.u)} ${r2(restY(lines[firstMark.line] as Line, firstMark.u) - 9)})`
    : undefined;
  const Tag: React.ElementType = as;
  const groupClass = "group/bunting-line";

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={live ? 0 : undefined}
        aria-describedby={live ? hintId : undefined}
        {...(live ? drag : {})}
        onPointerMove={(event: React.PointerEvent) => {
          if (live) drag.onPointerMove(event);
          strum(event);
        }}
        onPointerLeave={() => {
          lastPointer.current = null;
        }}
        onKeyDown={onKeyDown}
        className={cn(
          groupClass,
          "relative block w-full",
          live &&
            "cursor-grab touch-pan-y rounded-2 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid active:cursor-grabbing",
          className,
        )}
      >
        <span className="sr-only">{text.replace(/\s*\n\s*/g, " ")}</span>
        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${height}`}
          className="block h-auto w-full overflow-hidden"
          style={{ fontWeight: 700 }}
        >
          {lines.map((line, l) => (
            <clipPath key={`clip-${l}`} id={`${uid}-flag-${l}`}>
              <path d={shapePath(shape, line.fw, line.fh)} />
            </clipPath>
          ))}
          {lines.map((line, l) => {
            const ends = [restY(line, 0), restY(line, 1)];
            let d = `M ${PAD} ${r2(restY(line, 0))}`;
            for (let j = 0; j < NODES; j += 1) {
              const x = nodeX(j);
              d += ` L ${r2(x)} ${r2(restY(line, (x - PAD) / (W - PAD * 2)))}`;
            }
            d += ` L ${W - PAD} ${r2(restY(line, 1))}`;
            return (
              <g key={`string-${l}`} style={{ color: stringColor }}>
                <path
                  ref={(node) => {
                    strings.current[l] = node;
                  }}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.4}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {ends.map((y, e) => (
                  <circle
                    key={e}
                    cx={e === 0 ? PAD : W - PAD}
                    cy={r2(y)}
                    r={4.5}
                    fill="currentColor"
                  />
                ))}
              </g>
            );
          })}
          {flags.map((flag, i) => {
            const line = lines[flag.line] as Line;
            const x = PAD + (W - PAD * 2) * flag.u;
            const y = restY(line, flag.u) + 1.5;
            const angle =
              ((Math.atan(restSlope(line, flag.u)) * 180) / Math.PI) * 0.85;
            const fs = r2(line.fw * LETTER_SIZE[shape]);
            return (
              <g
                key={i}
                ref={(node) => {
                  flagRefs.current[i] = node;
                }}
                transform={`translate(${r2(x)} ${r2(y)}) rotate(${r2(angle)}) skewX(${r2(restLean)}) scale(1 1)`}
              >
                <g clipPath={`url(#${uid}-flag-${flag.line})`}>
                  <path
                    d={shapePath(shape, line.fw, line.fh)}
                    style={{ fill: palette[flag.colour] }}
                  />
                  {/* The hem folded over the string. */}
                  <rect
                    x={r2(-line.fw / 2)}
                    y={0}
                    width={r2(line.fw)}
                    height={r2(line.fh * 0.08)}
                    fill="black"
                    opacity={0.2}
                  />
                  <rect
                    ref={(node) => {
                      shades.current[i] = node;
                    }}
                    x={r2(-line.fw / 2)}
                    y={0}
                    width={r2(line.fw)}
                    height={r2(line.fh * 1.1)}
                    fill="black"
                    opacity={0}
                  />
                  <rect
                    ref={(node) => {
                      lights.current[i] = node;
                    }}
                    x={r2(-line.fw / 2)}
                    y={0}
                    width={r2(line.fw)}
                    height={r2(line.fh * 1.1)}
                    fill="white"
                    opacity={0}
                  />
                </g>
                <text
                  x={0}
                  y={r2(line.fh * LETTER_AT[shape])}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={fs}
                  style={{
                    fill: letterColor,
                    stroke: "color-mix(in oklab, black 22%, transparent)",
                    strokeWidth: r2(fs * 0.05),
                    paintOrder: "stroke",
                  }}
                >
                  {flag.char}
                </text>
              </g>
            );
          })}
          {/* The keyboard's pluck point: a small caret above the string. */}
          <path
            ref={markerRef}
            d="M -7 -9 L 7 -9 L 0 0 Z"
            transform={markerAt}
            className="opacity-0 transition-opacity group-focus-visible/bunting-line:opacity-100"
            style={{ fill: stringColor }}
          />
        </svg>
      </Tag>
      {live ? (
        <span id={hintId} className="sr-only">
          Press Space to pluck the string; Left and Right move along it.
        </span>
      ) : null}
    </>
  );
}
