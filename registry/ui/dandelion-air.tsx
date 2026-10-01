"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DandelionAirProps = {
  /** The air quality index, 0 to 500. */
  aqi: number;
  /** How hard the wind blows, 0 to 1: the lean of the stem and how fast seeds sail off. @default 0.4 */
  wind?: number;
  /** How many seeds a full head carries, 24 to 72. @default 48 */
  seeds?: number;
  /** The widget's name, used for the reading. @default "Air quality" */
  label?: string;
  /** Where the reading is from, shown over the sky. */
  place?: string;
  /** After a blow, with how many seeds are left on the head before it fills back in. */
  onBlow?: (left: number) => void;
  /** A swish for each blow. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** The sky's drawing box. */
const W = 300;
const H = 130;
/** Where the stem leaves the ground, and the head's height at rest. */
const BX = 86;
const BY = 124;
const HY = 54;
/** The seed head's radius. */
const R = 38;
const GROW_MS = 550;
/** How long blown seeds are gone before the head fills back in. */
const REGROW_MS = 1400;
/** A swipe slower than this, in px/s, is a stroke, not a breath. */
const BLOW_SPEED = 240;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Band = {
  name: string;
  spoken: string;
  advice: string;
  /** The top of the band's index range. */
  top: number;
  pigment: string;
};

/*
 * Bands are pigments: each a token's hue at a fixed lightness, so a band's
 * colour means the same in either theme. Text stays in text tokens.
 */
const BANDS: Band[] = [
  {
    name: "Good",
    spoken: "good",
    advice: "Clean air. Enjoy it.",
    top: 50,
    pigment: "oklch(from var(--success) 0.72 0.15 h)",
  },
  {
    name: "Moderate",
    spoken: "moderate",
    advice: "Fine for most people.",
    top: 100,
    pigment: "oklch(from var(--warn) 0.85 0.15 calc(h + 14))",
  },
  {
    name: "Sensitive",
    spoken: "unhealthy for sensitive groups",
    advice: "Sensitive groups take it easy.",
    top: 150,
    pigment: "oklch(from var(--warn) 0.75 0.16 calc(h - 26))",
  },
  {
    name: "Unhealthy",
    spoken: "unhealthy",
    advice: "Cut time outdoors short.",
    top: 200,
    pigment: "oklch(from var(--danger) 0.62 0.2 h)",
  },
  {
    name: "Very unhealthy",
    spoken: "very unhealthy",
    advice: "Stay indoors if you can.",
    top: 300,
    pigment: "oklch(from var(--danger) 0.52 0.16 calc(h + 290))",
  },
  {
    name: "Hazardous",
    spoken: "hazardous",
    advice: "Everyone stay indoors.",
    top: 500,
    pigment: "oklch(from var(--danger) 0.4 0.12 calc(h - 6))",
  },
];

const bandIndex = (aqi: number) => {
  const i = BANDS.findIndex((b) => aqi <= b.top);
  return i === -1 ? BANDS.length - 1 : i;
};

/** The index's place on the six-band scale, 0 to 1. */
const scaleOf = (aqi: number) => {
  const a = clamp(aqi, 0, 500);
  const i = bandIndex(a);
  const lo = i === 0 ? 0 : (BANDS[i - 1]?.top ?? 0);
  const hi = BANDS[i]?.top ?? 500;
  return (i + (a - lo) / Math.max(1, hi - lo)) / BANDS.length;
};

/** How much of a full head the index leaves on the stem, band by band. */
const EDGES = [0, 50, 100, 150, 200, 300, 500];
const SHARES = [1, 0.85, 0.65, 0.45, 0.25, 0.05, 0];
function shareOf(aqi: number) {
  const a = clamp(aqi, 0, 500);
  for (let i = 1; i < EDGES.length; i += 1) {
    const hi = EDGES[i] as number;
    if (a <= hi) {
      const lo = EDGES[i - 1] as number;
      const from = SHARES[i - 1] as number;
      const to = SHARES[i] as number;
      return from + ((to - from) * (a - lo)) / (hi - lo);
    }
  }
  return 0;
}

/** A small seeded generator: the same head on the server and in every browser. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Seed = {
  d: string;
  /** Where its tuft is, from the receptacle. */
  tipX: number;
  tipY: number;
  /** Its spoke's angle on screen, degrees (0 is right, -90 up). */
  angle: number;
  /** Toward the viewer, -1 to 1. */
  z: number;
};

type Head = {
  seeds: Seed[];
  /** Seed index by rank: rank 0 holds on longest. */
  order: number[];
  /** Rank by seed index. */
  rank: number[];
  /** Indices back to front. */
  back: number[];
  front: number[];
};

/*
 * The head: seeds spread over a sphere on the golden angle (leaving the
 * bottom, where the stem is, bare) and projected. Each seed is a stalk and a
 * pappus whose filaments open around the stalk's own axis in 3D, so a seed
 * facing you is a star and one side-on is a fan — the puff reads as round
 * without a blur or a gradient.
 */
function headOf(count: number): Head {
  const rand = lcg(0x5eed_d00d ^ count);
  const seeds: Seed[] = [];
  const keys: number[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (1.86 * (i + 0.5)) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * golden;
    const dx = Math.cos(theta) * ring;
    const dz = Math.sin(theta) * ring;
    // On screen y grows downward.
    const dir = [dx, -y, dz] as const;
    const helper = Math.abs(dir[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
    const ux = dir[1] * helper[2]! - dir[2] * helper[1]!;
    const uy = dir[2] * helper[0]! - dir[0] * helper[2]!;
    const uz = dir[0] * helper[1]! - dir[1] * helper[0]!;
    const ul = Math.hypot(ux, uy, uz) || 1;
    const u = [ux / ul, uy / ul, uz / ul] as const;
    const v = [
      dir[1] * u[2] - dir[2] * u[1],
      dir[2] * u[0] - dir[0] * u[2],
      dir[0] * u[1] - dir[1] * u[0],
    ] as const;
    const tip = R * 0.72;
    const tx = dir[0] * tip;
    const ty = dir[1] * tip;
    const parts = [
      `M ${r2(dir[0] * 4)} ${r2(dir[1] * 4)} L ${r2(tx)} ${r2(ty)}`,
    ];
    const lf = R * 0.32;
    const spin = rand() * Math.PI;
    for (let k = 0; k < 7; k += 1) {
      const phi = spin + (k * Math.PI * 2) / 7;
      const ex =
        tx +
        lf *
          (0.38 * dir[0] +
            0.92 * (u[0] * Math.cos(phi) + v[0] * Math.sin(phi)));
      const ey =
        ty +
        lf *
          (0.38 * dir[1] +
            0.92 * (u[1] * Math.cos(phi) + v[1] * Math.sin(phi)));
      parts.push(`M ${r2(tx)} ${r2(ty)} L ${r2(ex)} ${r2(ey)}`);
    }
    seeds.push({
      d: parts.join(" "),
      tipX: r2(tx),
      tipY: r2(ty),
      angle: r2((Math.atan2(dir[1], dir[0]) * 180) / Math.PI),
      z: r2(dz),
    });
    // Downwind and high seeds go first, the way a real head goes bald on
    // its lee side; the jitter keeps the edge ragged.
    keys.push(dx * 0.55 + y * 0.25 + (rand() - 0.5) * 0.9);
  }
  const order = keys
    .map((k, i) => ({ k, i }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.i);
  const rank: number[] = [];
  order.forEach((i, r) => {
    rank[i] = r;
  });
  const byDepth = seeds
    .map((s, i) => ({ z: s.z, i }))
    .sort((a, b) => a.z - b.z)
    .map((e) => e.i);
  return {
    seeds,
    order,
    rank,
    back: byDepth.filter((i) => (seeds[i]?.z ?? 0) < 0),
    front: byDepth.filter((i) => (seeds[i]?.z ?? 0) >= 0),
  };
}

/** A seed in flight: a parachute, achene at the origin, pappus up. */
const FLYER =
  "M 0 0 L 0 -8 M 0 -8 L -4.4 -11.6 M 0 -8 L -2.4 -12.6 M 0 -8 L 0 -13 M 0 -8 L 2.4 -12.6 M 0 -8 L 4.4 -11.6";

const SEED = "oklch(from var(--ink) 0.98 0.006 h)";
const STEM = "oklch(from var(--success) 0.56 0.1 calc(h - 20))";
const LEAF = "oklch(from var(--success) 0.5 0.11 calc(h - 15))";
const sky = (pigment: string) =>
  `color-mix(in oklab, var(--card) 22%, ${pigment})`;
const SKY_TOP = sky("oklch(from var(--accent-bright) 0.64 0.11 calc(h - 28))");
const SKY_LOW = sky("oklch(from var(--accent-bright) 0.86 0.05 calc(h - 40))");

type Pt = { x: number; y: number };

function toSegment(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t =
    l2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

type Flight = {
  el: SVGPathElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  age: number;
  life: number;
  phase: number;
};

type Slot = {
  /** How much of the seed is on the head, 0 to 1. */
  scale: number;
  pending: "none" | "detach" | "grow";
  /** When the pending change starts, on the frame clock. */
  at: number;
  /** When growing started, or -1. */
  growFrom: number;
  /** The push a pending detach leaves with. */
  vx: number;
  vy: number;
  /** Which of its two flight paths it uses next. */
  next: 0 | 1;
};

type Sim = {
  head: Head;
  nodes: SVGGElement[];
  flyers: SVGPathElement[];
  slots: Slot[];
  flights: Flight[];
  /** Seeds the reading wants on the head. */
  want: number;
  raf: number;
  last: number;
  timers: number[];
  rand: () => number;
};

type Api = {
  reconcile: (want: number, stagger: boolean) => void;
  finish: () => void;
  frame: (now: number) => void;
};

/**
 * An air-quality widget drawn as a dandelion clock. The seeds still on the
 * head are the reading — a full clock in clean air, a bald stalk in
 * hazardous air — and when the index rises the seeds that no longer belong
 * let go one after another and sail off downwind, turning pappus-up as they
 * go; when it falls, seeds unfold back onto the head. The sky takes a haze
 * in the band's colour and the number rolls to its new value.
 *
 * A quick swipe across the head blows the seeds it passes along the swipe —
 * a gentle one takes a few, a hard one clears it — and the stem bends with
 * the gust and springs back on the recoil spring; then the head fills back
 * in to what the index says. The head is a real button: a tap, Space or
 * Enter is one gust downwind. The frame loop runs only while seeds are
 * moving, on screen, in a visible page. Under reduced motion seeds fade off
 * and on where they are, with no flight, sway or stagger, while the reading
 * and the haze still change.
 */
export function DandelionAir({
  aqi,
  wind = 0.4,
  seeds = 48,
  label = "Air quality",
  place,
  onBlow,
  sound = false,
  disabled = false,
  className,
}: DandelionAirProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const skyId = `dandelion-sky-${uid}`;
  const hazeId = `dandelion-haze-${uid}`;
  const hintId = `dandelion-hint-${uid}`;

  const count = clamp(Math.round(seeds), 12, 96);
  const reading = clamp(Math.round(aqi), 0, 500);
  const band = BANDS[bandIndex(reading)] ?? (BANDS[0] as Band);
  const want = Math.round(count * shareOf(reading));
  const breeze = clamp(wind, 0, 1);
  const head = React.useMemo(() => headOf(count), [count]);

  // The seeds drawn on first paint of a layout. After that the frame loop
  // owns them, so a new reading never repaints the head from React.
  const [layout, setLayout] = React.useState({ n: count, k: want });
  if (layout.n !== count) setLayout({ n: count, k: want });

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [seenBand, setSeenBand] = React.useState(band.name);
  if (seenBand !== band.name) {
    setSeenBand(band.name);
    setSaid({
      n: said.n + 1,
      text: `${label} now ${band.spoken}: index ${reading}.`,
    });
  }

  const leanTo = r2(breeze * 16);
  const lean = useMotionValue(leanTo);
  const shown = useMotionValue(reading);
  const marker = useMotionValue(scaleOf(reading));
  const haze = useMotionValue(clamp(reading / 300, 0, 1));

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const flyRef = React.useRef<SVGGElement | null>(null);
  const sim = React.useRef<Sim | null>(null);
  const visible = React.useRef(true);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const pen = React.useRef<{ at: Pt; blown: number; swished: number } | null>(
    null,
  );
  const tracker = React.useRef(createVelocityTracker(60));
  const api = React.useRef<Api | null>(null);
  // Each frame runs the latest render's loop, so a new wind reaches the
  // seeds already in the air.
  const tick = React.useCallback((now: number) => api.current?.frame(now), []);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const headX = useTransform(lean, (l) => r2(BX + l));
  const headY = useTransform(lean, (l) => r2(HY + Math.abs(l) * 0.16));
  const stem = useTransform(
    lean,
    (l) =>
      `M ${BX} ${BY} Q ${r2(BX + l * 0.15)} ${r2((BY + HY) / 2 + 8)} ${r2(BX + l)} ${r2(HY + Math.abs(l) * 0.16 + 3)}`,
  );
  const numberText = useTransform(shown, (v) => String(Math.round(v)));
  const markerLeft = useTransform(marker, (m) => `${r2(m * 100)}%`);

  /** Writes one seed's place on the head. */
  const paint = (s: Sim, i: number) => {
    const node = s.nodes[i];
    const slot = s.slots[i];
    if (!node || !slot) return;
    const k = r2(slot.scale);
    node.setAttribute("opacity", String(k));
    node.setAttribute("transform", `scale(${Math.max(0.001, k)})`);
  };

  const launch = (s: Sim, i: number, vx: number, vy: number) => {
    const slot = s.slots[i];
    const seed = s.head.seeds[i];
    if (!slot || !seed) return;
    slot.scale = 0;
    slot.pending = "none";
    slot.growFrom = -1;
    paint(s, i);
    const el = s.flyers[i * 2 + slot.next];
    slot.next = slot.next === 0 ? 1 : 0;
    if (!el) return;
    s.flights = s.flights.filter((f) => f.el !== el);
    const hx = headX.get();
    const hy = headY.get();
    const rad = (seed.angle * Math.PI) / 180;
    s.flights.push({
      el,
      x: hx + Math.cos(rad) * 4,
      y: hy + Math.sin(rad) * 4,
      vx,
      vy,
      rot: seed.angle + 90,
      age: 0,
      life: 2.3 + s.rand() * 1.2,
      phase: s.rand() * Math.PI * 2,
    });
  };

  const frame = (now: number) => {
    const s = sim.current;
    if (!s) return;
    s.raf = 0;
    if (!visible.current || document.hidden) {
      api.current?.finish();
      return;
    }
    const dt = Math.min(0.05, (now - (s.last || now)) / 1000);
    s.last = now;
    let busy = false;
    s.slots.forEach((slot, i) => {
      if (slot.pending === "detach") {
        busy = true;
        if (now >= slot.at) launch(s, i, slot.vx, slot.vy);
      } else if (slot.pending === "grow") {
        busy = true;
        if (now >= slot.at) {
          slot.pending = "none";
          slot.growFrom = now;
        }
      }
      if (slot.growFrom >= 0) {
        busy = true;
        const p = clamp((now - slot.growFrom) / GROW_MS, 0, 1);
        slot.scale = 1 - Math.pow(1 - p, 3);
        if (p >= 1) {
          slot.scale = 1;
          slot.growFrom = -1;
        }
        paint(s, i);
      }
    });
    const drift = 26 + 110 * breeze;
    s.flights = s.flights.filter((f) => {
      f.age += dt;
      // A pappus is nearly all drag: whatever it was thrown with, it is
      // riding the wind within a fifth of a second.
      f.vx += (drift - f.vx) * Math.min(1, dt * 4.5);
      f.vy += (-(5 + 5 * Math.sin(f.phase)) - f.vy) * Math.min(1, dt * 3.5);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot +=
        (12 * Math.sin(f.age * 3 + f.phase) - f.rot) * Math.min(1, dt * 2.6);
      const x = f.x + 3 * Math.sin(f.age * 2.6 + f.phase);
      const y = f.y + 2 * Math.cos(f.age * 1.9 + f.phase);
      const edge = Math.min(1, (W - x) / 14, (y + 6) / 14);
      const fade = Math.min(1, (f.life - f.age) / 0.6, edge);
      if (fade <= 0 || f.age >= f.life) {
        f.el.setAttribute("opacity", "0");
        return false;
      }
      f.el.setAttribute("opacity", String(r2(fade * 0.95)));
      f.el.setAttribute(
        "transform",
        `translate(${r2(x)} ${r2(y)}) rotate(${r2(f.rot)})`,
      );
      return true;
    });
    if (s.flights.length > 0) busy = true;
    if (busy) s.raf = window.requestAnimationFrame(tick);
    else s.last = 0;
  };

  const wake = () => {
    const s = sim.current;
    if (!s || s.raf || !motionSafe) return;
    if (!visible.current || document.hidden) {
      api.current?.finish();
      return;
    }
    s.raf = window.requestAnimationFrame(tick);
  };

  /** Everything still moving lands where it is going, at once. */
  const finish = () => {
    const s = sim.current;
    if (!s) return;
    if (s.raf) window.cancelAnimationFrame(s.raf);
    s.raf = 0;
    s.last = 0;
    for (const f of s.flights) f.el.setAttribute("opacity", "0");
    s.flights = [];
    s.slots.forEach((slot, i) => {
      if (slot.pending === "detach") slot.scale = 0;
      if (slot.pending === "grow" || slot.growFrom >= 0) slot.scale = 1;
      slot.pending = "none";
      slot.growFrom = -1;
      paint(s, i);
    });
  };

  /**
   * Brings the head to `next` seeds: the ones past it let go (the most
   * exposed first), the ones short of it unfold (the most sheltered first).
   */
  const reconcile = (next: number, stagger: boolean) => {
    const s = sim.current;
    if (!s) return;
    s.want = next;
    const now = performance.now();
    const leaving: number[] = [];
    const coming: number[] = [];
    s.head.order.forEach((i, r) => {
      const slot = s.slots[i];
      if (!slot) return;
      const on =
        slot.scale > 0 || slot.pending === "grow" || slot.growFrom >= 0;
      if (r < next && !on) coming.push(i);
      if (r >= next && (on || slot.pending === "detach")) leaving.unshift(i);
      if (r < next && slot.pending === "detach") slot.pending = "none";
    });
    if (!motionSafe) {
      for (const t of s.timers) window.clearTimeout(t);
      s.timers = [];
      for (const i of leaving) {
        const slot = s.slots[i];
        if (!slot) continue;
        Object.assign(slot, { scale: 0, pending: "none", growFrom: -1 });
        paint(s, i);
      }
      for (const i of coming) {
        const slot = s.slots[i];
        if (!slot) continue;
        Object.assign(slot, { scale: 1, pending: "none", growFrom: -1 });
        paint(s, i);
      }
      return;
    }
    const gap = stagger ? cascade(leaving.length) * 1000 : 0;
    const drift = 26 + 110 * breeze;
    leaving.forEach((i, n) => {
      const slot = s.slots[i];
      const seed = s.head.seeds[i];
      if (!slot || !seed) return;
      if (slot.pending === "grow" || (slot.growFrom >= 0 && slot.scale < 0.2)) {
        Object.assign(slot, { scale: 0, pending: "none", growFrom: -1 });
        paint(s, i);
        return;
      }
      const rad = (seed.angle * Math.PI) / 180;
      slot.pending = "detach";
      slot.at = now + n * gap;
      slot.vx = Math.cos(rad) * 30 + drift * 0.4;
      slot.vy = Math.sin(rad) * 30 - 10;
    });
    const grow = stagger ? cascade(coming.length) * 1000 : 0;
    coming.forEach((i, n) => {
      const slot = s.slots[i];
      if (!slot) return;
      slot.pending = "grow";
      slot.at = Math.max(slot.at, now) + n * grow;
    });
    wake();
  };

  /** Seeds whose tufts lie near the swipe leave along it. */
  const blowAlong = (a: Pt, b: Pt, vx: number, vy: number) => {
    const s = sim.current;
    if (!s || disabled) return 0;
    const speed = Math.hypot(vx, vy);
    const reach = Math.min(40, 6 + speed * 0.02);
    const hx = headX.get();
    const hy = headY.get();
    const hit: number[] = [];
    s.head.seeds.forEach((seed, i) => {
      const slot = s.slots[i];
      if (!slot || slot.scale < 0.99 || slot.pending !== "none") return;
      const d = toSegment({ x: hx + seed.tipX, y: hy + seed.tipY }, a, b);
      if (d <= reach) hit.push(i);
    });
    return blow(hit, vx, vy);
  };

  const blow = (hit: number[], vx: number, vy: number) => {
    const s = sim.current;
    if (!s || hit.length === 0) return 0;
    const now = performance.now();
    const speed = Math.hypot(vx, vy);
    const push = Math.min(1, speed / 1400);
    // Seeds leave at a fraction of the swipe, never faster than they can
    // be seen to go.
    const k = Math.min(0.6, 420 / Math.max(1, speed));
    if (motionSafe) {
      for (const i of hit) {
        const f = k * (0.55 + s.rand() * 0.45);
        launch(
          s,
          i,
          vx * f + (s.rand() - 0.5) * 50,
          vy * f - 8 - s.rand() * 16,
        );
      }
      // The stem takes the gust and springs back with two bounces.
      run(
        "lean",
        animate(lean, leanTo, {
          ...springs.recoil,
          velocity: clamp(vx * 0.25, -260, 260) * (0.4 + push),
        }),
      );
      const gap = cascade(hit.length) * 1000;
      hit.forEach((i, n) => {
        const slot = s.slots[i];
        if (!slot || (s.head.rank[i] ?? 0) >= s.want) return;
        slot.pending = "grow";
        slot.at = now + REGROW_MS + n * gap;
      });
      wake();
    } else {
      for (const i of hit) {
        const slot = s.slots[i];
        if (!slot) continue;
        slot.scale = 0;
        paint(s, i);
      }
      s.timers.push(
        window.setTimeout(
          () => api.current?.reconcile(s.want, false),
          REGROW_MS,
        ),
      );
    }
    const left = s.slots.filter((slot) => slot.scale >= 0.99).length;
    onBlow?.(left);
    return hit.length;
  };

  /** A tap, Space or Enter: one gust downwind, taking about half the head. */
  const gust = (pan = 0) => {
    const s = sim.current;
    if (!s || disabled) return;
    const hit = s.head.seeds
      .map((seed, i) => ({ i, k: seed.tipX + (s.rand() - 0.5) * 50 }))
      .filter(({ i, k }) => (s.slots[i]?.scale ?? 0) >= 0.99 && k > -4)
      .map(({ i }) => i);
    const n = blow(hit, 520, -60);
    if (n > 0) {
      audio.play("swish", {
        pitch: 0.9,
        gain: r2(Math.min(0.6, 0.25 + n * 0.02)),
        pan,
      });
    }
  };

  React.useEffect(() => {
    api.current = { reconcile, finish, frame };
  });

  // A layout's seeds and flight paths. The flight paths are made here, not
  // rendered: they are scratch for the frame loop and never on the server.
  React.useEffect(() => {
    const svg = svgRef.current;
    const fly = flyRef.current;
    if (!svg || !fly) return;
    const nodes: SVGGElement[] = [];
    for (const node of svg.querySelectorAll<SVGGElement>("[data-seed]")) {
      nodes[Number(node.dataset.seed)] = node;
    }
    const flyers: SVGPathElement[] = [];
    for (let j = 0; j < head.seeds.length * 2; j += 1) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
      el.setAttribute("d", FLYER);
      el.setAttribute("opacity", "0");
      fly.appendChild(el);
      flyers.push(el);
    }
    const slots: Slot[] = head.seeds.map((_, i) => ({
      scale: (head.rank[i] ?? 0) < layout.k ? 1 : 0,
      pending: "none",
      at: 0,
      growFrom: -1,
      vx: 0,
      vy: 0,
      next: 0,
    }));
    const s: Sim = {
      head,
      nodes,
      flyers,
      slots,
      flights: [],
      want: layout.k,
      raf: 0,
      last: 0,
      timers: [],
      rand: lcg(0x0b10_5eed ^ head.seeds.length),
    };
    sim.current = s;
    slots.forEach((_, i) => paint(s, i));
    return () => {
      if (s.raf) window.cancelAnimationFrame(s.raf);
      for (const t of s.timers) window.clearTimeout(t);
      for (const el of flyers) el.remove();
      if (sim.current === s) sim.current = null;
    };
    // A layout is built once per seed count; the reading reconciles below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head]);

  // The reading: seeds let go or unfold, the number rolls, the haze thickens.
  React.useEffect(() => {
    api.current?.reconcile(want, true);
  }, [want, head]);

  React.useEffect(() => {
    const quick = { duration: durations.fast };
    run(
      "shown",
      animate(
        shown,
        reading,
        motionSafe ? { duration: durations.slow, ease: easings.enter } : quick,
      ),
    );
    run(
      "marker",
      animate(marker, scaleOf(reading), motionSafe ? springs.glide : quick),
    );
    run(
      "haze",
      animate(haze, clamp(reading / 300, 0, 1), {
        duration: durations.slow,
        ease: easings.enter,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading, motionSafe]);

  React.useEffect(() => {
    run(
      "lean",
      animate(lean, leanTo, motionSafe ? springs.glide : { duration: 0 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leanTo, motionSafe]);

  // Reduced motion lands everything in flight.
  React.useEffect(() => {
    if (!motionSafe) api.current?.finish();
  }, [motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.finish();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const running = anims.current;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // Off screen nothing moves: whatever is in the air lands at once.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) api.current?.finish();
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  /** Pointer to the sky's own units. */
  const local = (x: number, y: number): Pt | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return {
      x: ((x - rect.left) / rect.width) * W,
      y: ((y - rect.top) / rect.height) * H,
    };
  };
  const unitsPerPx = () => {
    const rect = svgRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 ? W / rect.width : 1;
  };

  const swipe = (to: Pt, vx: number, vy: number, clientX: number) => {
    const p = pen.current;
    if (!p) return;
    const k = unitsPerPx();
    const speed = Math.hypot(vx, vy);
    if (speed >= BLOW_SPEED) {
      const n = blowAlong(p.at, to, vx * k, vy * k);
      if (n > 0) {
        p.blown += n;
        const t = performance.now();
        if (t - p.swished > 180) {
          p.swished = t;
          const rect = svgRef.current?.getBoundingClientRect();
          const pan = rect
            ? r2(
                clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1) *
                  0.6,
              )
            : 0;
          audio.play("swish", {
            pitch: r2(0.8 + Math.min(0.8, speed / 1500)),
            gain: r2(Math.min(0.6, 0.22 + n * 0.03)),
            pan,
          });
        }
      }
    }
    p.at = to;
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset, event }) => {
      const from = local(point.x - offset.x, point.y - offset.y);
      if (!from) return;
      tracker.current.reset();
      tracker.current.push(
        point.x - offset.x,
        point.y - offset.y,
        event.timeStamp - 16,
      );
      pen.current = { at: from, blown: 0, swished: -1000 };
    },
    onMove: ({ point, event }) => {
      tracker.current.push(point.x, point.y, event.timeStamp);
      const to = local(point.x, point.y);
      if (!to) return;
      const v = tracker.current.velocity();
      swipe(to, v.x, v.y, point.x);
    },
    onEnd: ({ point, velocity }) => {
      // A flick that ends short of the head still carries on into it.
      const to = local(
        point.x + velocity.x * 0.06,
        point.y + velocity.y * 0.06,
      );
      if (to) swipe(to, velocity.x, velocity.y, point.x);
      pen.current = null;
    },
    onCancel: () => {
      pen.current = null;
    },
    onTap: (event) => {
      const rect = svgRef.current?.getBoundingClientRect();
      gust(
        rect
          ? r2(
              clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1) *
                0.6,
            )
          : 0,
      );
    },
  });

  const bandAt = bandIndex(reading);
  const hazeOpacity = useTransform(haze, (h) => r2(h * 0.8));
  const seedOpacity = (i: number) =>
    r2(0.6 + 0.4 * (((head.seeds[i]?.z ?? 0) + 1) / 2));

  const seedNode = (i: number) => (
    <g
      key={i}
      data-seed={i}
      opacity={(head.rank[i] ?? 0) < layout.k ? 1 : 0}
      className={motionSafe ? undefined : "transition-opacity duration-300"}
    >
      <path d={head.seeds[i]?.d} opacity={seedOpacity(i)} />
    </g>
  );

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={place ? `${label}, ${place}` : label}
      className={cn(
        "w-full max-w-[300px] overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Blow the dandelion"
        aria-describedby={hintId}
        disabled={disabled}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap. A click with no
          // pointer behind it — Space, Enter, assistive technology — is a
          // gust too, sound and all.
          if (event.detail === 0) gust();
        }}
        {...drag}
        className={cn(
          "relative block w-full touch-pan-y rounded-t-[15px] outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <svg
          ref={svgRef}
          aria-hidden
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
        >
          <defs>
            <linearGradient id={skyId} x1={0} y1={0} x2={0} y2={1}>
              <stop offset={0} style={{ stopColor: SKY_TOP }} />
              <stop offset={1} style={{ stopColor: SKY_LOW }} />
            </linearGradient>
            <linearGradient id={hazeId} x1={0} y1={0} x2={0} y2={1}>
              <stop
                offset={0}
                stopOpacity={0.36}
                className="transition-[stop-color] duration-500"
                style={{ stopColor: band.pigment }}
              />
              <stop
                offset={1}
                className="transition-[stop-color] duration-500"
                style={{ stopColor: band.pigment }}
              />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={W} height={H} fill={`url(#${skyId})`} />
          <path
            d="M0 106 Q50 92 104 100 T204 96 Q256 92 300 100 V130 H0 Z"
            style={{
              fill: "oklch(from var(--success) 0.66 0.06 calc(h - 30))",
            }}
          />
          <motion.rect
            x={0}
            y={0}
            width={W}
            height={H}
            fill={`url(#${hazeId})`}
            style={{ opacity: hazeOpacity }}
          />
          <path
            d="M0 118 Q70 110 150 116 T300 114 V130 H0 Z"
            style={{
              fill: "oklch(from var(--success) 0.6 0.1 calc(h - 25))",
            }}
          />
          <path
            d="M14 122 l2 -7 M20 121 l-1 -6 M150 120 l2 -6 M158 121 l-1 -7 M232 119 l2 -6 M276 120 l-2 -7 M282 121 l1 -5"
            fill="none"
            strokeWidth={1.2}
            strokeLinecap="round"
            style={{ stroke: LEAF }}
          />

          <path
            d={`M${BX} ${BY} Q${BX - 10} 119 ${BX - 26} 117 Q${BX - 20} 121 ${BX - 24} 123 Q${BX - 12} 122 ${BX} ${BY} Z M${BX} ${BY} Q${BX + 12} 118 ${BX + 30} 118 Q${BX + 22} 121 ${BX + 26} 124 Q${BX + 12} 123 ${BX} ${BY} Z`}
            style={{ fill: LEAF }}
          />
          <motion.path
            d={stem}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            style={{ stroke: STEM }}
          />

          <motion.g style={{ x: headX, y: headY }}>
            <path
              d="M -3 3 Q -6 8 -7 12 M -1 4 Q -2 9 -2 13 M 1.5 4 Q 3 9 4 12.5 M 3.5 3 Q 7 7 8 10"
              fill="none"
              strokeWidth={1}
              strokeLinecap="round"
              style={{ stroke: STEM }}
            />
            <g
              key={count}
              fill="none"
              strokeWidth={0.6}
              strokeLinecap="round"
              style={{ stroke: SEED }}
            >
              {head.back.map(seedNode)}
              <ellipse
                cx={0}
                cy={0}
                rx={4.6}
                ry={4}
                strokeWidth={0}
                style={{
                  fill: "oklch(from var(--warn) 0.62 0.06 calc(h - 20))",
                }}
              />
              {head.front.map(seedNode)}
            </g>
          </motion.g>

          <g
            ref={flyRef}
            fill="none"
            strokeWidth={0.6}
            strokeLinecap="round"
            style={{ stroke: SEED }}
          />
        </svg>
        {place ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2 right-2 inline-flex h-5 max-w-[calc(50%-0.5rem)] items-center truncate rounded-full bg-popover/85 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
          >
            {place}
          </span>
        ) : null}
      </button>

      <div className="flex items-center gap-3 px-3 py-2.5">
        <div
          role="meter"
          aria-label={`${label} index`}
          aria-valuemin={0}
          aria-valuemax={500}
          aria-valuenow={reading}
          aria-valuetext={`${reading}, ${band.spoken}`}
          className="flex w-12 shrink-0 flex-col"
        >
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            AQI
          </span>
          <motion.span className="font-mono text-2xl leading-none text-foreground tabular-nums">
            {numberText}
          </motion.span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm leading-5 font-medium text-foreground">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full transition-colors duration-500"
              style={{ background: band.pigment }}
            />
            <span className="truncate">{band.name}</span>
          </p>
          <p className="truncate text-xs text-ink-3" title={band.advice}>
            {band.advice}
          </p>
          <div aria-hidden className="relative mt-1.5 flex h-1 gap-0.5">
            {BANDS.map((b, i) => (
              <span
                key={b.name}
                className="h-full flex-1 rounded-full transition-opacity duration-500"
                style={{
                  background: b.pigment,
                  opacity: i === bandAt ? 1 : 0.35,
                }}
              />
            ))}
            <motion.span
              className="absolute -top-0.5 h-2 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: markerLeft }}
            />
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        Swipe across it, or press Enter, to blow the seeds. The seeds left show
        the air: fewer seeds, worse air.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
