"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CloudChamberTint = "mist" | "ember" | "aqua";
export type CloudChamberPole = "north" | "south";

export type CloudChamberProps = {
  /** How many particles cross the chamber, 0 to 1: from one every second or so to about ten a second on a wide card. @default 0.5 */
  rate?: number;
  /** The magnet's strength, 0 to 1, and the chamber's own weak field with it: 0 leaves every track straight. @default 0.6 */
  field?: number;
  /** The vapour and the lamp: neutral, warm or cold. @default "mist" */
  tint?: CloudChamberTint;
  /** Controlled: which way the magnet bends the tracks. */
  pole?: CloudChamberPole;
  /** Initial pole when uncontrolled. @default "north" */
  defaultPole?: CloudChamberPole;
  /** Fires from the press or key that flipped the pole, with the new pole. */
  onPoleChange?: (pole: CloudChamberPole) => void;
  /** The keyboard surface's accessible name. @default "Cloud chamber" */
  label?: string;
  /** Ambient only: the chamber ignores the pointer and the keyboard and leaves the tab order. */
  disabled?: boolean;
  /** What sits over the chamber: a hero, a heading. Rendered in a layer above it. */
  children?: React.ReactNode;
  /** The root fills its container (`h-full w-full`); size it here. */
  className?: string;
};

/** The card the rates are tuned for: rates scale with area from here. */
const AREA = 760 * 232;
/** A track's points are at least this far apart, in px. */
const SPACING = 1.5;
const MOST_TRACKS = 72;
/** How long a touch-placed magnet stays after the finger lifts, in ms. */
const TOUCH_HOLD = 1600;
/** Presses on the hero's own controls are theirs, not the chamber's. */
const CONTROLS =
  "a,button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** A small seeded generator: the same chamber, the same scattering, every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Roughly normal, from three uniforms: cheap and bounded. */
const gauss = (rand: () => number) => (rand() + rand() + rand() - 1.5) * 1.15;

/*
 * The vapour's colours. The tint is a pigment; the trails mix it with the
 * page's own foreground, so they are dark ink on the light theme and lit
 * vapour on the dark one. They live on the canvas element as its text and
 * border colours, so the canvas reads them back resolved, and a 1ms colour
 * transition tells it when the theme or the tint has changed them.
 */
const TINTS: Record<CloudChamberTint, string> = {
  mist: "oklch(0.72 0.035 250)",
  ember: "oklch(0.7 0.17 45)",
  aqua: "oklch(0.76 0.12 205)",
};

const inks = (tint: string): React.CSSProperties => ({
  color: `color-mix(in oklab, var(--foreground) 64%, ${tint})`,
  borderTopColor: `color-mix(in oklab, var(--foreground) 28%, ${tint})`,
  borderRightColor: tint,
  borderBottomColor: `color-mix(in oklab, var(--foreground) 45%, var(--background))`,
  borderLeftColor: `color-mix(in oklab, var(--foreground) 88%, ${tint})`,
});

/** The chamber itself: lit from the left by a lamp of the tint, dark felt below. */
const chamber = (tint: string) =>
  [
    `radial-gradient(90% 150% at 0% 42%, color-mix(in oklab, ${tint} 18%, transparent), transparent 70%)`,
    `linear-gradient(180deg, var(--background) 30%, color-mix(in oklab, var(--background) 86%, black))`,
  ].join(", ");

type Colors = {
  core: string;
  halo: string;
  magnet: string;
  needle: string;
  head: string;
};

type Kind = "alpha" | "beta" | "muon" | "delta";

type Start = { x: number; y: number; a: number; p: number };

type Track = {
  kind: Kind;
  start: Start;
  /** Seeds the track's own scattering, so a re-run in a new field wanders the same way. */
  seed: number;
  rand: () => number;
  pts: number[];
  x: number;
  y: number;
  a: number;
  p: number;
  q: number;
  pEnd: number;
  /** Momentum lost per px of path. */
  loss: number;
  s: number;
  budget: number;
  /** Visual speed, px/s. */
  speed: number;
  born: number;
  flying: boolean;
  life: number;
  core: number;
  halo: number;
  phase: number;
  dash: number;
  kinkAt: number;
  kink: number;
  /** Path lengths at which a muon knocks off a delta ray. */
  deltas: number[];
  /** A still photograph's age, as a share of its life. */
  still: number;
};

type Magnet = {
  x: number;
  y: number;
  /** 0 to 1: eased presence; `target` is where it is heading. */
  on: number;
  target: number;
  inside: boolean;
  keyboard: boolean;
  kx: number;
  ky: number;
  flash: number;
  touch: number;
  /** A touch brought the magnet in with this press: its tap must not also flip it. */
  fresh: boolean;
};

type Sim = {
  w: number;
  h: number;
  dpr: number;
  T: number;
  rand: () => number;
  tracks: Track[];
  photo: Track[];
  next: number;
  rate: number;
  field: number;
  sign: 1 | -1;
  mag: Magnet;
  colors: Colors | null;
  warmed: boolean;
};

const createSim = (): Sim => ({
  w: 0,
  h: 0,
  dpr: 1,
  T: 0,
  rand: lcg(0x6c078965),
  tracks: [],
  photo: [],
  next: 0,
  rate: 0.5,
  field: 0.6,
  sign: 1,
  mag: {
    x: 0,
    y: 0,
    on: 0,
    target: 0,
    inside: false,
    keyboard: false,
    kx: -1,
    ky: -1,
    flash: 0,
    touch: 0,
    fresh: false,
  },
  colors: null,
  warmed: false,
});

/** The component's one simulation, made on first use. */
const ensure = (ref: React.RefObject<Sim | null>): Sim => {
  ref.current ??= createSim();
  return ref.current;
};

/** Where the alpha source sits: a needle near the lower left. */
const sourceOf = (s: Sim) => ({ x: s.w * 0.07 + 6, y: s.h * 0.84 });
/** The magnet's reach, px. */
const reachOf = (s: Sim) => 40 + 0.08 * Math.min(s.w, s.h);

/**
 * The field at a point: the chamber's own weak field plus the magnet's,
 * falling off like a pole's, `1/(1+(r/R)²)^1.5`.
 */
function fieldAt(s: Sim, x: number, y: number): number {
  // Strong enough on its own that slow electrons curl at the ends of their
  // tracks, so the field shows before the magnet comes near.
  let b = 0.045 * s.field;
  const m = s.mag;
  if (m.on > 0.001) {
    const r = reachOf(s);
    const dx = x - m.x;
    const dy = y - m.y;
    const u = 1 + (dx * dx + dy * dy) / (r * r);
    b += (s.sign * 0.95 * s.field * m.on) / (u * Math.sqrt(u));
  }
  return b;
}

function makeTrack(
  kind: Kind,
  start: Start,
  born: number,
  seed: number,
  rand: () => number,
): Track {
  const base = {
    kind,
    start,
    seed,
    rand: lcg(seed),
    pts: [start.x, start.y],
    x: start.x,
    y: start.y,
    a: start.a,
    p: start.p,
    s: 0,
    born,
    flying: true,
    phase: rand() * Math.PI * 2,
    dash: rand() * 6,
    kinkAt: Infinity,
    kink: 0,
    deltas: [] as number[],
    still: rand() * 0.72,
  };
  switch (kind) {
    case "alpha": {
      const budget = lerp(40, 105, rand());
      const kinked = rand() < 0.25;
      return {
        ...base,
        q: 2,
        pEnd: 0,
        loss: 0,
        budget,
        speed: 520,
        life: lerp(2.5, 3.3, rand()),
        core: 2.1,
        halo: 6,
        kinkAt: kinked ? budget * lerp(0.75, 0.9, rand()) : Infinity,
        kink: kinked ? (rand() < 0.5 ? -1 : 1) * lerp(0.3, 0.75, rand()) : 0,
      };
    }
    case "muon": {
      const deltas: number[] = [];
      const n = rand() < 0.45 ? 1 : rand() < 0.3 ? 2 : 0;
      for (let i = 0; i < n; i += 1) deltas.push(lerp(40, 260, rand()));
      deltas.sort((a, b) => a - b);
      return {
        ...base,
        q: rand() < 0.5 ? -1 : 1,
        pEnd: 0,
        loss: 0,
        budget: 3000,
        speed: 3600,
        life: lerp(2, 2.8, rand()),
        core: 0.85,
        halo: 3,
        deltas,
      };
    }
    case "delta": {
      const budget = lerp(18, 50, rand());
      return {
        ...base,
        q: -1,
        pEnd: 0.9,
        loss: (start.p - 0.9) / budget,
        budget,
        speed: 650,
        life: lerp(1.6, 2.2, rand()),
        core: 0.8,
        halo: 2.6,
      };
    }
    default: {
      const budget = lerp(120, 360, rand());
      return {
        ...base,
        q: rand() < 0.88 ? -1 : 1,
        pEnd: 1.4,
        loss: (start.p - 1.4) / budget,
        budget,
        speed: 950,
        life: lerp(2.2, 3, rand()),
        core: 1,
        halo: 3.6,
      };
    }
  }
}

/** Puts a track back at its start, to run it again in a new field. */
function rewind(t: Track) {
  t.rand = lcg(t.seed);
  t.pts = [t.start.x, t.start.y];
  t.x = t.start.x;
  t.y = t.start.y;
  t.a = t.start.a;
  t.p = t.start.p;
  t.s = 0;
  t.flying = true;
}

/**
 * Moves a particle `dist` px through the field of the moment: it turns by
 * κ = qB/p per px, scatters (more as it slows), loses momentum and stops when
 * it runs out, leaves the chamber or reaches its range.
 */
function advance(s: Sim, t: Track, dist: number, spawned?: Track[]) {
  let left = dist;
  let guard = 0;
  const light = t.kind === "beta" || t.kind === "delta";
  while (left > 0 && t.flying && guard < 900) {
    guard += 1;
    const k = (t.q * fieldAt(s, t.x, t.y)) / t.p;
    const ds = Math.max(
      0.25,
      Math.min(left, 2, 0.3 / Math.max(Math.abs(k), 1e-3)),
    );
    if (light) t.a += gauss(t.rand) * (0.09 / t.p) * Math.sqrt(ds);
    t.a += k * ds;
    if (t.s < t.kinkAt && t.s + ds >= t.kinkAt) t.a += t.kink;
    t.x += Math.cos(t.a) * ds;
    t.y += Math.sin(t.a) * ds;
    t.s += ds;
    left -= ds;
    if (t.loss > 0) {
      t.p -= t.loss * ds;
      if (t.p <= t.pEnd) t.flying = false;
    }
    if (t.s >= t.budget) t.flying = false;
    if (t.x < -30 || t.x > s.w + 30 || t.y < -40 || t.y > s.h + 30) {
      t.flying = false;
    }
    const n = t.pts.length;
    const lx = t.pts[n - 2] ?? t.x;
    const ly = t.pts[n - 1] ?? t.y;
    if (!t.flying || Math.hypot(t.x - lx, t.y - ly) >= SPACING) {
      t.pts.push(t.x, t.y);
    }
    const next = t.deltas[0];
    if (spawned && next !== undefined && t.s >= next) {
      t.deltas.shift();
      if (t.x > 0 && t.y > 0 && t.x < s.w && t.y < s.h) {
        const side = t.rand() < 0.5 ? -1 : 1;
        spawned.push(
          makeTrack(
            "delta",
            {
              x: t.x,
              y: t.y,
              a: t.a + side * lerp(1, 1.7, t.rand()),
              p: lerp(1.6, 3, t.rand()),
            },
            t.born + t.s / t.speed,
            (t.seed ^ Math.imul(t.deltas.length + 1, 0x9e3779b1)) >>> 0,
            t.rand,
          ),
        );
      }
    }
  }
}

/** One particle, of a kind and from a place that suit it. */
function spawn(s: Sim, rand: () => number, born: number): Track {
  const { w, h } = s;
  const m = s.mag;
  const roll = rand();
  const seed = (rand() * 4294967296) >>> 0;
  if (roll < 0.25) {
    // A cosmic muon, from above, right across.
    const a = lerp(0.62, 2.52, rand());
    return makeTrack(
      "muon",
      { x: lerp(-20, w + 20, rand()), y: -6, a, p: 60 },
      born,
      seed,
      rand,
    );
  }
  if (roll < 0.55) {
    // An alpha: from the source needle, or from radon anywhere in the gas.
    const src = sourceOf(s);
    const fromSource = rand() < 0.55;
    const start: Start = fromSource
      ? { x: src.x, y: src.y, a: lerp(-2.7, -0.15, rand()), p: 70 }
      : { x: rand() * w, y: rand() * h, a: rand() * Math.PI * 2, p: 70 };
    return makeTrack("alpha", start, born, seed, rand);
  }
  // A beta. While the magnet is out, a third are sent past it, so a hover
  // is answered within a second rather than whenever chance allows.
  if (m.target > 0.5 && rand() < 0.35) {
    const r = reachOf(s);
    const from = rand() * Math.PI * 2;
    const d = r * lerp(2.2, 3.4, rand());
    const x = m.x + Math.cos(from) * d;
    const y = m.y + Math.sin(from) * d;
    const miss = (rand() - 0.5) * 1.1;
    return makeTrack(
      "beta",
      {
        x: clamp(x, 0, w),
        y: clamp(y, 0, h),
        a: Math.atan2(m.y - y, m.x - x) + miss * 0.6,
        p: lerp(3.5, 8, rand()),
      },
      born,
      seed,
      rand,
    );
  }
  return makeTrack(
    "beta",
    {
      x: rand() * w,
      y: rand() * h,
      a: rand() * Math.PI * 2,
      p: lerp(4, 13, rand()),
    },
    born,
    seed,
    rand,
  );
}

/** Particles per second for this box. */
const rateOf = (s: Sim) =>
  Math.max(0.25, lerp(0.6, 10, s.rate) * clamp((s.w * s.h) / AREA, 0.35, 3));

/** A still photograph: a seeded set of tracks at assorted ages. */
function photograph(s: Sim): Track[] {
  const rand = lcg(0x1f123bb5);
  const n = Math.round(lerp(9, 30, s.rate) * clamp((s.w * s.h) / AREA, 0.4, 2));
  const out: Track[] = [];
  const keep = s.mag.target;
  // Photographs are not aimed at the magnet: the same tracks, only bent.
  s.mag.target = 0;
  for (let i = 0; i < n; i += 1) out.push(spawn(s, rand, 0));
  s.mag.target = keep;
  return out;
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  t: Track,
  T: number,
  c: Colors,
  still: boolean,
): boolean {
  const age = still ? t.still * t.life : T - t.born;
  if (age >= t.life || age < 0) return false;
  const u = age / t.life;
  const fade = u < 0.3 ? 1 : 1 - smooth((u - 0.3) / 0.7);
  const formed = still ? 1 : Math.min(1, age / 0.05 + 0.2);
  // The vapour drifts down with the gas and curls in its slow currents.
  const dx = still ? 0 : 3 * Math.sin(age * 1.1 + t.phase);
  const dy = still ? 0 : 10 * age;
  const amp = 3.2 * Math.pow(u, 1.3);
  const clock = still ? 0 : T;
  const pts = t.pts;
  const n = pts.length / 2;
  if (n < 2) return true;
  const path = new Path2D();
  const tail = t.kind === "alpha" ? new Path2D() : null;
  const tailFrom = Math.floor(n * 0.68);
  for (let i = 0; i < n; i += 1) {
    const px = pts[2 * i] ?? 0;
    const py = pts[2 * i + 1] ?? 0;
    let x = px + dx;
    let y = py + dy;
    if (amp > 0.05) {
      x += amp * Math.sin(0.05 * py + 1.3 * clock + t.phase);
      y += amp * Math.cos(0.047 * px - 1.1 * clock + t.phase * 1.7);
    }
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
    if (tail && i >= tailFrom) {
      if (i === tailFrom) tail.moveTo(x, y);
      else tail.lineTo(x, y);
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.15 * fade * formed;
  ctx.strokeStyle = c.halo;
  ctx.lineWidth = t.halo * (1 + 2.4 * u);
  ctx.stroke(path);
  ctx.strokeStyle = c.core;
  if (u < 0.42) {
    ctx.globalAlpha = 0.88 * fade * formed;
    ctx.lineWidth = t.core * (1 + 0.6 * u);
    ctx.stroke(path);
    if (tail) {
      ctx.lineWidth = t.core * 1.55;
      ctx.stroke(tail);
    }
  } else {
    // Older vapour breaks up into droplets.
    ctx.globalAlpha = 0.78 * fade;
    ctx.setLineDash([0.01, 2 + 7 * (u - 0.42)]);
    ctx.lineDashOffset = t.dash;
    ctx.lineWidth = t.core * 1.7;
    ctx.stroke(path);
    ctx.setLineDash([]);
  }
  if (t.flying && !still) {
    // Condensation forming just behind the particle: the brightest part.
    const head = new Path2D();
    const from = Math.max(0, n - 9);
    for (let i = from; i < n; i += 1) {
      const x = (pts[2 * i] ?? 0) + dx;
      const y = (pts[2 * i + 1] ?? 0) + dy;
      if (i === from) head.moveTo(x, y);
      else head.lineTo(x, y);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.head;
    ctx.lineWidth = t.core * 0.9;
    ctx.stroke(head);
  }
  return true;
}

function drawMagnet(
  ctx: CanvasRenderingContext2D,
  s: Sim,
  c: Colors,
  T: number,
) {
  const m = s.mag;
  if (m.on < 0.01) return;
  const r = reachOf(s);
  const strength = 0.35 + 0.65 * s.field;
  const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 1.8);
  glow.addColorStop(0, c.magnet);
  glow.addColorStop(1, "transparent");
  ctx.setLineDash([]);
  ctx.globalAlpha = (0.16 + 0.22 * m.flash) * m.on * strength;
  ctx.fillStyle = glow;
  ctx.fillRect(m.x - r * 1.8, m.y - r * 1.8, r * 3.6, r * 3.6);

  // An arrow round the pole shows which way it bends an electron. On the
  // canvas y grows downward, so a positive turn is clockwise on screen.
  const cw = -s.sign > 0;
  const ring = r * 0.62;
  const a0 = T * 0.6 * (cw ? 1 : -1);
  const a1 = a0 + (cw ? 1 : -1) * Math.PI * 1.45;
  ctx.globalAlpha = (0.42 + 0.4 * m.flash) * m.on;
  ctx.strokeStyle = c.magnet;
  ctx.lineWidth = 1.2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(m.x, m.y, ring, a0, a1, !cw);
  ctx.stroke();
  const tx = m.x + Math.cos(a1) * ring;
  const ty = m.y + Math.sin(a1) * ring;
  const along = a1 + (cw ? Math.PI / 2 : -Math.PI / 2);
  ctx.beginPath();
  for (const side of [-1, 1]) {
    const back = along + Math.PI + side * 0.5;
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(back) * 5, ty + Math.sin(back) * 5);
  }
  ctx.stroke();

  if (m.keyboard) {
    // Without a cursor, the keyboard's magnet needs its own mark.
    ctx.globalAlpha = 0.9 * m.on;
    ctx.strokeStyle = c.head;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
    for (const [ox, oy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.moveTo(m.x + ox * 8, m.y + oy * 8);
      ctx.lineTo(m.x + ox * 12, m.y + oy * 12);
    }
    ctx.stroke();
  }
}

function drawNeedle(ctx: CanvasRenderingContext2D, s: Sim, c: Colors) {
  const src = sourceOf(s);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = c.needle;
  ctx.fillStyle = c.needle;
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(src.x - 16, src.y + 12);
  ctx.lineTo(src.x, src.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(src.x, src.y, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

type Api = {
  resize: () => void;
  colors: () => void;
  wake: () => void;
  sleep: () => void;
  still: () => void;
};

/**
 * A cloud chamber as a backdrop. Particles cross it unseen and leave vapour
 * trails that condense right behind them, then broaden, break into droplets,
 * drift down with the gas and curl in its currents until they fade: short fat
 * alphas from a source needle (thickening at the end, now and then with a
 * kink), thin wandering betas that tighten into spirals as they slow, long
 * straight muons from above, and the tiny curls they knock loose.
 *
 * The pointer is a magnet. Particles are integrated a step at a time in the
 * field of the moment — κ = qB/p, the magnet's field falling off like a
 * pole's — so a beta passing it hooks round it and a slow one is caught and
 * spirals down to a point, while muons only bend when they pass close. A
 * glow and a curl arrow mark the magnet; a press flips its pole, and the
 * tracks curl the other way from then on.
 *
 * Canvas, at most 2× resolution, colours read from its own computed style and
 * re-read on a theme change, a frame loop only while it is on screen in a
 * visible page. The keyboard path is a real `role="application"` surface:
 * focus brings the magnet in, arrow keys move it, Enter or Space flip it.
 * Under reduced motion the chamber is a still photograph whose tracks are
 * re-run in the magnet's field each time it moves, so they still bend.
 */
export function CloudChamber({
  rate = 0.5,
  field = 0.6,
  tint = "mist",
  pole,
  defaultPole = "north",
  onPoleChange,
  label = "Cloud chamber",
  disabled = false,
  children,
  className,
}: CloudChamberProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<CloudChamberPole>(defaultPole);
  const shownPole = pole ?? own;
  // Spoken from the pole actually shown, once the host has answered.
  const [said, setSaid] = React.useState({ n: 0, key: shownPole, text: "" });
  if (said.key !== shownPole) {
    setSaid({
      n: said.n + 1,
      key: shownPole,
      text: shownPole === "north" ? "North pole." : "South pole.",
    });
  }

  const pigment = TINTS[tint] ?? TINTS.mist;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const simRef = React.useRef<Sim | null>(null);
  const loop = React.useRef({ raf: 0, last: 0, seen: false });
  const api = React.useRef<Api | null>(null);
  const repaintSoon = React.useRef(0);

  const getSim = () => ensure(simRef);

  const readColors = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cs = getComputedStyle(canvas);
    getSim().colors = {
      core: cs.color,
      halo: cs.borderTopColor,
      magnet: cs.borderRightColor,
      needle: cs.borderBottomColor,
      head: cs.borderLeftColor,
    };
  };

  /** One frame: spawn, fly, age, draw. Returns whether to keep going. */
  const frame = (dt: number) => {
    const s = getSim();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const c = s.colors;
    if (!ctx || !c || s.w < 1 || s.h < 1) return false;
    s.T += dt;
    const m = s.mag;
    m.on += (m.target - m.on) * (1 - Math.exp(-dt / durations.fast));
    m.flash *= Math.exp(-dt / 0.35);

    if (!s.warmed) {
      // Start mid-session rather than in an empty chamber.
      s.warmed = true;
      const n = Math.round(rateOf(s) * 2.4);
      for (let i = 0; i < n; i += 1) {
        const t = spawn(s, s.rand, s.T - s.rand() * 2.6);
        advance(s, t, t.budget);
        s.tracks.push(t);
      }
    }

    s.next -= dt;
    const fresh: Track[] = [];
    while (s.next <= 0) {
      fresh.push(spawn(s, s.rand, s.T + s.next));
      s.next += -Math.log(1 - s.rand() * 0.999) / rateOf(s);
    }
    for (const t of fresh) s.tracks.push(t);
    const knocked: Track[] = [];
    for (const t of s.tracks) {
      if (t.flying) advance(s, t, t.speed * dt, knocked);
    }
    for (const t of knocked) s.tracks.push(t);
    if (s.tracks.length > MOST_TRACKS) {
      s.tracks.splice(0, s.tracks.length - MOST_TRACKS);
    }

    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawNeedle(ctx, s, c);
    ctx.lineCap = "round";
    s.tracks = s.tracks.filter((t) => drawTrack(ctx, t, s.T, c, false));
    drawMagnet(ctx, s, c, s.T);
    ctx.globalAlpha = 1;
    return true;
  };

  /** Reduced motion: the photograph, re-run in the field as it is now. */
  const still = () => {
    const s = getSim();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const c = s.colors;
    if (!ctx || !c || s.w < 1 || s.h < 1) return;
    s.mag.on = s.mag.target;
    s.mag.flash = 0;
    if (s.photo.length === 0) s.photo = photograph(s);
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    drawNeedle(ctx, s, c);
    ctx.lineCap = "round";
    for (const t of s.photo) {
      rewind(t);
      advance(s, t, t.budget);
      drawTrack(ctx, t, 0, c, true);
    }
    drawMagnet(ctx, s, c, 0);
    ctx.globalAlpha = 1;
  };

  const sleep = () => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  };

  const wake = () => {
    const l = loop.current;
    if (!motionSafe) {
      sleep();
      if (l.seen) still();
      return;
    }
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 0;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (api.current && frameRef.current(dt)) {
        l.raf = window.requestAnimationFrame(tick);
      }
    };
    l.raf = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const s = getSim();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const changed = w !== s.w || h !== s.h;
    s.w = w;
    s.h = h;
    s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (changed) s.photo = [];
    if (!s.colors) readColors();
    if (!motionSafe) still();
    else wake();
  };

  const frameRef = React.useRef(frame);
  React.useEffect(() => {
    frameRef.current = frame;
    api.current = {
      resize,
      colors: () => {
        readColors();
        if (!motionSafe) still();
      },
      wake,
      sleep,
      still,
    };
  });

  // The props the simulation reads, and a redraw or a wake when they change.
  React.useEffect(() => {
    const s = ensure(simRef);
    const next = shownPole === "north" ? 1 : -1;
    if (s.sign !== next) s.mag.flash = 1;
    s.sign = next;
    s.field = clamp01(field);
    if (s.rate !== clamp01(rate)) s.photo = [];
    s.rate = clamp01(rate);
    api.current?.wake();
  }, [rate, field, shownPole, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.sleep();
      else api.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const l = loop.current;
    const s = ensure(simRef);
    return () => {
      if (l.raf) window.cancelAnimationFrame(l.raf);
      l.raf = 0;
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
      window.clearTimeout(s.mag.touch);
    };
  }, []);

  // Size and visibility, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const l = loop.current;
    const sizer = new ResizeObserver(() => api.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      l.seen = Boolean(entry?.isIntersecting);
      if (l.seen) api.current?.wake();
      else api.current?.sleep();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      l.seen = false;
      if (l.raf) window.cancelAnimationFrame(l.raf);
      l.raf = 0;
    };
  }, []);

  // A new theme or tint changes the canvas's colours; the 1ms colour
  // transition says when, and they are read again.
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.colors();
    });
  };

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const placeMagnet = (x: number, y: number) => {
    const s = getSim();
    s.mag.x = clamp(x, 0, s.w);
    s.mag.y = clamp(y, 0, s.h);
    s.mag.target = 1;
    wake();
  };

  const liftMagnet = () => {
    const s = getSim();
    if (s.mag.keyboard || s.mag.inside) return;
    s.mag.target = 0;
    wake();
  };

  const flip = () => {
    const next = shownPole === "north" ? "south" : "north";
    if (pole === undefined) setOwn(next);
    onPoleChange?.(next);
  };

  const fromControl = (target: EventTarget | null) => {
    const root = rootRef.current;
    if (!(target instanceof Element) || !root) return false;
    const hit = target.closest(CONTROLS);
    return Boolean(hit && root.contains(hit));
  };

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ background: chamber(pigment) }}
      onPointerMove={(event) => {
        if (disabled) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        const at = local(event.clientX, event.clientY);
        if (!at) return;
        getSim().mag.inside = event.pointerType !== "touch";
        placeMagnet(at.x, at.y);
      }}
      onPointerDown={(event) => {
        if (disabled || event.pointerType !== "touch") return;
        const s = getSim();
        window.clearTimeout(s.mag.touch);
        s.mag.fresh = s.mag.target < 0.5;
        const at = local(event.clientX, event.clientY);
        if (at) placeMagnet(at.x, at.y);
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") return;
        const s = getSim();
        window.clearTimeout(s.mag.touch);
        s.mag.touch = window.setTimeout(liftMagnet, TOUCH_HOLD);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        getSim().mag.inside = false;
        liftMagnet();
      }}
      onClick={(event) => {
        if (disabled || fromControl(event.target)) return;
        // A first tap on a touch screen brings the magnet; a press while it
        // is there flips its pole.
        const s = getSim();
        if (s.mag.fresh) {
          s.mag.fresh = false;
          return;
        }
        flip();
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 block size-full transition-colors duration-1"
        style={inks(pigment)}
      />

      <div
        role="application"
        aria-roledescription="cloud chamber"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onFocus={(event) => {
          if (disabled || !event.currentTarget.matches(":focus-visible")) {
            return;
          }
          const s = getSim();
          s.mag.keyboard = true;
          if (s.mag.kx < 0) {
            s.mag.kx = s.w / 2;
            s.mag.ky = s.h / 2;
          }
          if (!s.mag.inside) placeMagnet(s.mag.kx, s.mag.ky);
        }}
        onBlur={() => {
          const s = getSim();
          s.mag.keyboard = false;
          liftMagnet();
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const s = getSim();
          const step = (event.shiftKey ? 0.18 : 0.06) * Math.max(s.w, s.h);
          let { kx, ky } = s.mag;
          if (kx < 0 || !s.mag.keyboard) {
            kx = s.mag.on > 0.5 ? s.mag.x : s.w / 2;
            ky = s.mag.on > 0.5 ? s.mag.y : s.h / 2;
          }
          switch (event.key) {
            case "ArrowRight":
              kx += step;
              break;
            case "ArrowLeft":
              kx -= step;
              break;
            case "ArrowDown":
              ky += step;
              break;
            case "ArrowUp":
              ky -= step;
              break;
            case "Enter":
            case " ":
              event.preventDefault();
              if (!event.repeat) {
                s.mag.keyboard = true;
                placeMagnet(
                  s.mag.on > 0.5 ? s.mag.x : kx,
                  s.mag.on > 0.5 ? s.mag.y : ky,
                );
                flip();
              }
              return;
            default:
              return;
          }
          event.preventDefault();
          s.mag.keyboard = true;
          s.mag.kx = clamp(kx, 0, s.w);
          s.mag.ky = clamp(ky, 0, s.h);
          placeMagnet(s.mag.kx, s.mag.ky);
        }}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />

      {children !== undefined && children !== null ? (
        <div className="relative h-full w-full">{children}</div>
      ) : null}

      <p id={hintId} className="sr-only">
        Arrow keys move a magnet through the chamber, Shift for larger steps;
        tracks passing it bend. Enter or Space flips its pole.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
