"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NodeLeapProps = {
  /** The content above the field: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many filaments drift through the field, 2 to 16. @default 7 */
  strands?: number;
  /** How often a signal hops to its next bead, per second, 0.5 to 8. @default 3 */
  hopRate?: number;
  /** How far a lit bead's light spreads, 0 (bare beads) to 1 (blooming). @default 0.6 */
  glow?: number;
  /** Beads threaded on each filament, 6 to 24. @default 14 */
  beads?: number;
  /** Signals travelling on each filament, 1 to 4. @default 2 */
  signals?: number;
  /** The pace of the slow current the filaments drift on, 0 (still) to 2. @default 1 */
  current?: number;
  /** The chance a signal jumps across where two filaments drift close, 0 to 1. @default 0.5 */
  cross?: number;
  /** Signal colours, as CSS colours (up to four); each signal takes one. @default accent, signal and a warm pigment */
  colors?: readonly string[];
  /** The pointer is a gentle current, and a press sends a new signal. @default true */
  interactive?: boolean;
  /** How strongly the pointer's current moves the filaments, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold everything still. @default false */
  paused?: boolean;
  /** Seeds the filaments, their beads and the signals' walks. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires each time a signal jumps across from one filament to another. */
  onCrossing?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const COLORS = [
  "var(--accent-bright)",
  "var(--signal)",
  "oklch(from var(--warn) 0.8 0.14 h)",
] as const;

const POINTS = 36;
const MAX_STRANDS = 16;
const MAX_BEADS = 24;
const MAX_SIGNALS = 4;
/** A hop's flight, s: quick enough to read as a jump, not a flow. */
const HOP = 0.085;
const STEP = 1 / 120;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x7f4a7c15) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Each strand's waves: base height, two travelling waves and a slow sway. */
type Strand = {
  y: number;
  a1: number;
  k1: number;
  w1: number;
  p1: number;
  a2: number;
  k2: number;
  w2: number;
  p2: number;
  sway: number;
  ws: number;
  slide: number;
};

function strandsFor(seed: number): Strand[] {
  const rand = lcg(seed * 41 + 3);
  return Array.from({ length: MAX_STRANDS }, (_, i) => ({
    y: rand(),
    a1: 0.06 + rand() * 0.1,
    k1: 1.2 + rand() * 1.6,
    w1: 0.12 + rand() * 0.16,
    p1: rand() * Math.PI * 2,
    a2: 0.02 + rand() * 0.04,
    k2: 3 + rand() * 3,
    w2: 0.2 + rand() * 0.3,
    p2: rand() * Math.PI * 2,
    sway: 0.03 + rand() * 0.05,
    ws: 0.05 + rand() * 0.08,
    slide: (i % 2 === 0 ? 1 : -1) * (0.004 + rand() * 0.006),
  }));
}

/** A strand's height at a share of the width, as a share of the height, at a time. */
function heightAt(s: Strand, u: number, t: number, row: number, rows: number) {
  const base = (row + 0.5) / rows + (s.y - 0.5) * (0.6 / rows);
  return (
    base +
    s.a1 * Math.sin(u * Math.PI * 2 * s.k1 * 0.5 + t * s.w1 + s.p1) +
    s.a2 * Math.sin(u * Math.PI * 2 * s.k2 * 0.5 - t * s.w2 + s.p2) +
    s.sway * Math.sin(t * s.ws + s.p1 * 0.7)
  );
}

type Config = {
  strands: number;
  hopRate: number;
  glow: number;
  beads: number;
  signals: number;
  current: number;
  cross: number;
  interactive: boolean;
  strength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Signal = {
  strand: number;
  bead: number;
  dir: number;
  wait: number;
  colour: number;
  /** A hop in flight: from where to where, and how far along. */
  hop: null | {
    fs: number;
    fb: number;
    ts: number;
    tb: number;
    t: number;
    across: boolean;
  };
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  wake: () => void;
  readColours: () => void;
  hand: (x: number, y: number, moving: boolean) => void;
  away: () => void;
  spark: (x: number, y: number) => void;
  dispose: () => void;
};

/**
 * The field outside React: strands as point lists displaced by the pointer's
 * current, beads carried along them, and signals that wait on a bead and hop
 * to the next.
 */
function createField(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  crossed: () => void,
): Engine {
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let live = false;
  const size = { w: 0, h: 0, dpr: 1 };
  let strands: Strand[] = strandsFor(1);
  let rand = lcg(1);
  let time = 0;
  // Pointer current: each point's offset and velocity, px.
  const off = new Float32Array(MAX_STRANDS * POINTS * 2);
  const vel = new Float32Array(MAX_STRANDS * POINTS * 2);
  // Where each point is this frame, px.
  const pts = new Float32Array(MAX_STRANDS * POINTS * 2);
  // Beads: position and how lit each is, and by which colour.
  const beadPos = new Float32Array(MAX_STRANDS * MAX_BEADS * 2);
  const beadLit = new Float32Array(MAX_STRANDS * MAX_BEADS);
  const beadTone = new Uint8Array(MAX_STRANDS * MAX_BEADS);
  let signals: Signal[] = [];
  const hand = { x: 0, y: 0, vx: 0, vy: 0, on: false, at: 0 };
  const paint = {
    ground: "rgb(0, 0, 0)",
    strand: "rgb(120, 130, 150)",
    tones: [] as string[],
    dark: true,
  };
  let sprites: HTMLCanvasElement[] = [];
  let shade: CanvasGradient | null = null;

  const readColours = () => {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const pc = probe.getContext("2d", { willReadFrequently: true });
    const read = (el: Element | undefined) => {
      if (!pc || !el) return [0, 0, 0] as const;
      pc.clearRect(0, 0, 1, 1);
      pc.fillStyle = "rgb(0, 0, 0)";
      pc.fillStyle = getComputedStyle(el).color;
      pc.fillRect(0, 0, 1, 1);
      const d = pc.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] as const;
    };
    const k = carriers.children;
    const ground = read(k[0]);
    const strand = read(k[1]);
    paint.ground = `rgb(${ground[0]}, ${ground[1]}, ${ground[2]})`;
    paint.strand = `rgb(${strand[0]}, ${strand[1]}, ${strand[2]})`;
    paint.dark =
      (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 <
      0.5;
    paint.tones = [];
    sprites = [];
    for (let i = 2; i < k.length; i += 1) {
      const c = read(k[i]);
      paint.tones.push(`rgb(${c[0]}, ${c[1]}, ${c[2]})`);
      // A soft disc of each colour, drawn once and scaled per bead.
      const s = document.createElement("canvas");
      s.width = 64;
      s.height = 64;
      const sc = s.getContext("2d");
      if (sc) {
        const g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.9)`);
        g.addColorStop(0.25, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.35)`);
        g.addColorStop(1, `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0)`);
        sc.fillStyle = g;
        sc.fillRect(0, 0, 64, 64);
      }
      sprites.push(s);
    }
    shapeShade();
  };

  const shapeShade = () => {
    const ctx = canvas.getContext("2d");
    const { w, h } = size;
    if (!ctx || w < 1) return;
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.hypot(w, h) * 0.6,
    );
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(
      1,
      paint.dark ? "rgba(0, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.04)",
    );
    shade = g;
  };

  const seedSignals = () => {
    const c = cfg;
    if (!c) return;
    rand = lcg(c.seed * 97 + 11);
    const n = clamp(Math.round(c.strands), 2, MAX_STRANDS);
    const nb = clamp(Math.round(c.beads), 6, MAX_BEADS);
    const per = clamp(Math.round(c.signals), 1, MAX_SIGNALS);
    signals = [];
    for (let s = 0; s < n; s += 1) {
      for (let q = 0; q < per; q += 1) {
        signals.push({
          strand: s,
          bead: Math.floor(rand() * nb),
          dir: rand() < 0.5 ? -1 : 1,
          wait: rand() * 1.2,
          colour: Math.floor(rand() * 8),
          hop: null,
        });
      }
    }
    beadLit.fill(0);
    // A few beads lit as if mid-relay, for the still frame and the first paint.
    for (const sg of signals) {
      const i = sg.strand * MAX_BEADS + sg.bead;
      beadLit[i] = 0.9;
      beadTone[i] = sg.colour;
    }
  };

  /** Point and bead positions for this moment. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    const { w, h } = size;
    const n = clamp(Math.round(c.strands), 2, MAX_STRANDS);
    const nb = clamp(Math.round(c.beads), 6, MAX_BEADS);
    const x0 = -w * 0.08;
    const span = w * 1.16;
    for (let s = 0; s < n; s += 1) {
      const st = strands[s];
      if (!st) continue;
      for (let k = 0; k < POINTS; k += 1) {
        const u = k / (POINTS - 1);
        const o = (s * POINTS + k) * 2;
        pts[o] = x0 + span * u + (off[o] ?? 0);
        pts[o + 1] = heightAt(st, u, time, s, n) * h + (off[o + 1] ?? 0);
      }
      // Beads ride the current along the strand, wrapping at its ends.
      for (let b = 0; b < nb; b += 1) {
        let u = (b + 0.5) / nb + st.slide * time * clamp(c.current, 0, 2);
        u -= Math.floor(u);
        const f = u * (POINTS - 1);
        const k = Math.min(POINTS - 2, Math.floor(f));
        const a = f - k;
        const o = (s * POINTS + k) * 2;
        const ob = (s * MAX_BEADS + b) * 2;
        beadPos[ob] = (pts[o] ?? 0) + ((pts[o + 2] ?? 0) - (pts[o] ?? 0)) * a;
        beadPos[ob + 1] =
          (pts[o + 1] ?? 0) + ((pts[o + 3] ?? 0) - (pts[o + 1] ?? 0)) * a;
      }
    }
  };

  /** The nearest bead on another strand within reach of this one, or -1. */
  const neighbour = (s: number, b: number, reach: number) => {
    const c = cfg;
    if (!c) return -1;
    const n = clamp(Math.round(c.strands), 2, MAX_STRANDS);
    const nb = clamp(Math.round(c.beads), 6, MAX_BEADS);
    const ob = (s * MAX_BEADS + b) * 2;
    const x = beadPos[ob] ?? 0;
    const y = beadPos[ob + 1] ?? 0;
    let best = -1;
    let bestD = reach * reach;
    for (let t = 0; t < n; t += 1) {
      if (t === s) continue;
      for (let q = 0; q < nb; q += 1) {
        const o = (t * MAX_BEADS + q) * 2;
        const dx = (beadPos[o] ?? 0) - x;
        const dy = (beadPos[o + 1] ?? 0) - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) {
          bestD = d2;
          best = t * MAX_BEADS + q;
        }
      }
    }
    return best;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const { w, h } = size;
    time += dt * clamp(c.current, 0, 2);
    const n = clamp(Math.round(c.strands), 2, MAX_STRANDS);
    const nb = clamp(Math.round(c.beads), 6, MAX_BEADS);
    // The pointer's current pushes nearby points; each relaxes back on a
    // spring with the springs.drift constants, so strands part and settle.
    const k = springs.drift.stiffness / springs.drift.mass;
    const damp = springs.drift.damping / springs.drift.mass;
    const reach = Math.max(60, Math.min(w, h) * 0.45);
    const push = hand.on && c.interactive ? clamp01(c.strength) * 2.2 : 0;
    for (let s = 0; s < n; s += 1) {
      for (let q = 0; q < POINTS; q += 1) {
        const o = (s * POINTS + q) * 2;
        let fx = -k * (off[o] ?? 0) - damp * (vel[o] ?? 0);
        let fy = -k * (off[o + 1] ?? 0) - damp * (vel[o + 1] ?? 0);
        if (push > 0) {
          const dx = (pts[o] ?? 0) - hand.x;
          const dy = (pts[o + 1] ?? 0) - hand.y;
          const f = Math.exp(-(dx * dx + dy * dy) / (reach * reach * 0.25));
          fx += hand.vx * f * push * 6;
          fy += hand.vy * f * push * 6;
        }
        vel[o] = (vel[o] ?? 0) + fx * dt;
        vel[o + 1] = (vel[o + 1] ?? 0) + fy * dt;
        off[o] = clamp((off[o] ?? 0) + (vel[o] ?? 0) * dt, -h * 0.3, h * 0.3);
        off[o + 1] = clamp(
          (off[o + 1] ?? 0) + (vel[o + 1] ?? 0) * dt,
          -h * 0.3,
          h * 0.3,
        );
      }
    }
    // The hand's speed fades when it stops moving.
    const quiet = Math.exp(-dt * 6);
    hand.vx *= quiet;
    hand.vy *= quiet;
    place();
    // Beads cool.
    const cool = Math.exp(-dt * 2.6);
    for (let i = 0; i < beadLit.length; i += 1)
      beadLit[i] = (beadLit[i] ?? 0) * cool;
    // Signals: wait, then hop; land and light the bead.
    const rate = clamp(c.hopRate, 0.2, 10);
    // Only where strands truly touch: a crossing should feel like an event.
    const crossReach = clamp(h * 0.05, 8, 16);
    for (const sg of signals) {
      if (sg.strand >= n) continue;
      if (sg.hop) {
        sg.hop.t += dt / HOP;
        if (sg.hop.t >= 1) {
          sg.strand = sg.hop.ts;
          sg.bead = sg.hop.tb;
          const i = sg.strand * MAX_BEADS + sg.bead;
          beadLit[i] = 1;
          beadTone[i] = sg.colour;
          sg.hop = null;
          sg.wait = (0.55 + rand() * 0.9) / rate;
        }
        continue;
      }
      const here = sg.strand * MAX_BEADS + sg.bead;
      // A resting signal keeps its bead lit.
      beadLit[here] = Math.max(beadLit[here] ?? 0, 0.62);
      beadTone[here] = sg.colour;
      sg.wait -= dt;
      if (sg.wait > 0) continue;
      const near =
        rand() < clamp01(c.cross) * 0.28
          ? neighbour(sg.strand, sg.bead, crossReach)
          : -1;
      if (near >= 0) {
        const ts = Math.floor(near / MAX_BEADS);
        sg.hop = {
          fs: sg.strand,
          fb: sg.bead,
          ts,
          tb: near % MAX_BEADS,
          t: 0,
          across: true,
        };
        sg.dir = rand() < 0.5 ? -1 : 1;
        crossed();
        continue;
      }
      let next = sg.bead + sg.dir;
      if (next < 0 || next >= nb) {
        sg.dir = -sg.dir;
        next = sg.bead + sg.dir;
      }
      sg.hop = {
        fs: sg.strand,
        fb: sg.bead,
        ts: sg.strand,
        tb: clamp(next, 0, nb - 1),
        t: 0,
        across: false,
      };
    }
  };

  const draw = () => {
    const c = cfg;
    const ctx = canvas.getContext("2d");
    if (!c || !ctx || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    const n = clamp(Math.round(c.strands), 2, MAX_STRANDS);
    const nb = clamp(Math.round(c.beads), 6, MAX_BEADS);
    const glow = clamp01(c.glow);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = paint.ground;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = paint.strand;
    // Filaments: a soft halo, then a hairline core, smoothed through midpoints.
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.beginPath();
      for (let s = 0; s < n; s += 1) {
        const o = s * POINTS * 2;
        ctx.moveTo(pts[o] ?? 0, pts[o + 1] ?? 0);
        for (let q = 1; q < POINTS - 1; q += 1) {
          const a = o + q * 2;
          const mx = ((pts[a] ?? 0) + (pts[a + 2] ?? 0)) / 2;
          const my = ((pts[a + 1] ?? 0) + (pts[a + 3] ?? 0)) / 2;
          ctx.quadraticCurveTo(pts[a] ?? 0, pts[a + 1] ?? 0, mx, my);
        }
      }
      if (pass === 0) {
        ctx.globalAlpha = paint.dark ? 0.05 + glow * 0.04 : 0.05;
        ctx.lineWidth = 3 + glow * 4;
      } else {
        ctx.globalAlpha = paint.dark ? 0.34 : 0.3;
        ctx.lineWidth = 0.8;
      }
      ctx.stroke();
    }
    const add = paint.dark ? "lighter" : "source-over";
    // Near-misses: a faint glimmer between beads on strands drifting close.
    const reach = clamp(h * 0.09, 14, 28);
    ctx.globalCompositeOperation = add;
    ctx.lineWidth = 1;
    for (let s = 0; s < n; s += 1) {
      for (let b = 0; b < nb; b += 1) {
        const oa = (s * MAX_BEADS + b) * 2;
        const ax = beadPos[oa] ?? 0;
        const ay = beadPos[oa + 1] ?? 0;
        for (let t = s + 1; t < Math.min(n, s + 3); t += 1) {
          for (let q = 0; q < nb; q += 1) {
            const ob = (t * MAX_BEADS + q) * 2;
            const dx = (beadPos[ob] ?? 0) - ax;
            const dy = (beadPos[ob + 1] ?? 0) - ay;
            const d2 = dx * dx + dy * dy;
            if (d2 > reach * reach) continue;
            const near = 1 - Math.sqrt(d2) / reach;
            ctx.globalAlpha = near * near * (paint.dark ? 0.35 : 0.3);
            ctx.strokeStyle =
              paint.tones[(s + q) % paint.tones.length] ?? paint.strand;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + dx, ay + dy);
            ctx.stroke();
          }
        }
      }
    }
    // Beads: bare ones as small dots, lit ones with their bloom.
    const tones = paint.tones.length || 1;
    for (let s = 0; s < n; s += 1) {
      for (let b = 0; b < nb; b += 1) {
        const i = s * MAX_BEADS + b;
        const x = beadPos[i * 2] ?? 0;
        const y = beadPos[i * 2 + 1] ?? 0;
        if (x < -20 || x > w + 20) continue;
        const lit = beadLit[i] ?? 0;
        const tone = (beadTone[i] ?? 0) % tones;
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = paint.dark ? 0.55 : 0.5;
        ctx.fillStyle = paint.strand;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        if (lit < 0.02) continue;
        const sprite = sprites[tone];
        if (sprite && glow > 0) {
          ctx.globalCompositeOperation = add;
          ctx.globalAlpha = lit * (paint.dark ? 0.9 : 0.55);
          const r = 6 + 20 * glow * (0.6 + 0.4 * lit);
          ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = Math.min(1, 0.4 + lit);
        ctx.fillStyle = paint.tones[tone] ?? paint.strand;
        ctx.beginPath();
        ctx.arc(x, y, 1.8 + lit * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Hops in flight: a quick streak along the strand, or an arc across.
    ctx.globalCompositeOperation = add;
    for (const sg of signals) {
      const hp = sg.hop;
      if (!hp) continue;
      const fa = (hp.fs * MAX_BEADS + hp.fb) * 2;
      const ta = (hp.ts * MAX_BEADS + hp.tb) * 2;
      const ax = beadPos[fa] ?? 0;
      const ay = beadPos[fa + 1] ?? 0;
      const bx = beadPos[ta] ?? 0;
      const by = beadPos[ta + 1] ?? 0;
      const p = clamp01(hp.t);
      const ease = 1 - (1 - p) * (1 - p);
      const tail = Math.max(0, ease - 0.45);
      const tone = paint.tones[sg.colour % tones] ?? paint.strand;
      // Across strands the jump bows out a little, like a spark arcing.
      const bow = hp.across ? 0.28 : 0;
      const mx = (ax + bx) / 2 - (by - ay) * bow;
      const my = (ay + by) / 2 + (bx - ax) * bow;
      const at = (u: number) => {
        const v = 1 - u;
        return [
          v * v * ax + 2 * v * u * mx + u * u * bx,
          v * v * ay + 2 * v * u * my + u * u * by,
        ] as const;
      };
      const head = at(ease);
      const back = at(tail);
      ctx.strokeStyle = tone;
      ctx.globalAlpha = hp.across ? 0.95 : 0.8;
      ctx.lineWidth = hp.across ? 1.8 : 1.4;
      ctx.beginPath();
      ctx.moveTo(back[0], back[1]);
      const mid = at((ease + tail) / 2);
      ctx.quadraticCurveTo(mid[0], mid[1], head[0], head[1]);
      ctx.stroke();
      const sprite = sprites[sg.colour % tones];
      if (sprite) {
        const r = 5 + 8 * glow;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(sprite, head[0] - r, head[1] - r, r * 2, r * 2);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (shade) {
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, w, h);
    }
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  const running = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused);
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg) return;
    if (!visible.current || document.hidden || !running()) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    carry += dt;
    let steps = 0;
    while (carry >= STEP && steps < 6) {
      carry -= STEP;
      steps += 1;
      step(STEP);
    }
    draw();
    frame = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (disposed || frame || !cfg) return;
    if (!visible.current || document.hidden) return;
    if (!running()) {
      place();
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    shapeShade();
    place();
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        strands = strandsFor(next.seed);
        readColours();
        seedSignals();
        resize();
        return;
      }
      if (was.colourKey !== next.colourKey) readColours();
      if (was.seed !== next.seed) strands = strandsFor(next.seed);
      if (
        was.seed !== next.seed ||
        was.strands !== next.strands ||
        was.beads !== next.beads ||
        was.signals !== next.signals
      )
        seedSignals();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      place();
      draw();
      kick();
    },
    resize,
    wake() {
      place();
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    hand(x, y, moving) {
      const t = performance.now() / 1000;
      if (hand.on && moving) {
        const dt = Math.max(0.008, t - hand.at);
        const vx = (x - hand.x) / dt;
        const vy = (y - hand.y) / dt;
        hand.vx = hand.vx * 0.5 + clamp(vx, -3000, 3000) * 0.5;
        hand.vy = hand.vy * 0.5 + clamp(vy, -3000, 3000) * 0.5;
      }
      hand.x = x;
      hand.y = y;
      hand.at = t;
      hand.on = true;
    },
    away() {
      hand.on = false;
      hand.vx = 0;
      hand.vy = 0;
    },
    spark(x, y) {
      const c = cfg;
      if (!c || !running()) return;
      const n = clamp(Math.round(c.strands), 2, MAX_STRANDS);
      const nb = clamp(Math.round(c.beads), 6, MAX_BEADS);
      let best = -1;
      let bestD = Infinity;
      for (let s = 0; s < n; s += 1) {
        for (let b = 0; b < nb; b += 1) {
          const o = (s * MAX_BEADS + b) * 2;
          const d = Math.hypot(
            (beadPos[o] ?? 0) - x,
            (beadPos[o + 1] ?? 0) - y,
          );
          if (d < bestD) {
            bestD = d;
            best = s * MAX_BEADS + b;
          }
        }
      }
      if (best < 0) return;
      const sg: Signal = {
        strand: Math.floor(best / MAX_BEADS),
        bead: best % MAX_BEADS,
        dir: rand() < 0.5 ? -1 : 1,
        wait: 0.05,
        colour: Math.floor(rand() * 8),
        hop: null,
      };
      beadLit[best] = 1;
      beadTone[best] = sg.colour;
      // A pressed-in signal replaces the oldest extra one, so they never pile up.
      const base = n * clamp(Math.round(c.signals), 1, MAX_SIGNALS);
      if (signals.length >= base + 6) signals.splice(base, 1);
      signals.push(sg);
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/* ------------------------------- component ------------------------------- */

/**
 * A background of long soft filaments drifting through the dark on a slow
 * current, each threaded with small beads. Signals do not flow along them:
 * a signal rests on a bead, then jumps to the next in a quick streak of light,
 * and the bead it lands on flares and cools. Where two filaments drift close,
 * a faint glimmer passes between their beads, and a signal about to hop may
 * jump across instead, arcing over the gap and carrying on along the other
 * filament. The pointer is a gentle current: it pushes the filaments aside
 * and each point drifts back on a spring with the springs.drift constants,
 * and a press sends a new signal from the nearest bead. Drawn in Canvas 2D,
 * additively on a dark page and as ink and pigment on a light one; under
 * reduced motion it is a still frame with beads lit as if mid-relay.
 */
export function NodeLeap({
  children,
  strands = 7,
  hopRate = 3,
  glow = 0.6,
  beads = 14,
  signals = 2,
  current = 1,
  cross = 0.5,
  colors = COLORS,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onCrossing,
  className,
}: NodeLeapProps) {
  const motionSafe = useMotionSafe();
  const tonesKey = (colors.length > 0 ? colors.slice(0, 4) : COLORS).join("|");
  // Keyed by the colours' text, so a new array of the same colours is no change.
  const tones = React.useMemo(() => tonesKey.split("|"), [tonesKey]);
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "color-mix(in oklab, var(--foreground) 62%, var(--background))",
      ...tones,
    ],
    [tones],
  );
  const colourKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef(onCrossing);

  const config: Config = {
    strands,
    hopRate,
    glow,
    beads,
    signals,
    current,
    cross,
    interactive,
    strength: pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onCrossing;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createField(root, canvas, carriers, visible, () =>
      report.current?.(),
    );
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = rootRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (r?.left ?? 0),
      y: event.clientY - (r?.top ?? 0),
    };
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!interactive) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        const p = local(event);
        engine.current?.hand(p.x, p.y, true);
      }}
      onPointerLeave={() => engine.current?.away()}
      onPointerCancel={() => engine.current?.away()}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") engine.current?.away();
      }}
      onPointerDown={(event) => {
        if (!interactive) return;
        // A press on the field, not on a control above it, sends a signal.
        const hit = (event.target as Element).closest?.(
          "a, button, input, textarea, select, label, [role=button], [tabindex]",
        );
        if (hit && hit !== rootRef.current) return;
        const p = local(event);
        engine.current?.spark(p.x, p.y);
      }}
      className={cn(
        "group/node-leap relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-500 group-data-live/node-leap:invisible group-data-live/node-leap:opacity-0"
      >
        <StillField seed={seed} strands={strands} beads={beads} tones={tones} />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((p, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: p }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still for the server render and the first paint: the
 * filaments at rest and a few beads lit, in SVG.
 */
function StillField({
  seed,
  strands,
  beads,
  tones,
}: {
  seed: number;
  strands: number;
  beads: number;
  tones: readonly string[];
}) {
  const W = 1000;
  const H = 300;
  const list = strandsFor(seed);
  const n = clamp(Math.round(strands), 2, MAX_STRANDS);
  const nb = clamp(Math.round(beads), 6, MAX_BEADS);
  const rand = lcg(seed * 97 + 11);
  const paths: string[] = [];
  const dots: { x: number; y: number; lit: number; tone: number }[] = [];
  for (let s = 0; s < n; s += 1) {
    const st = list[s];
    if (!st) continue;
    let d = "";
    const pts: [number, number][] = [];
    for (let k = 0; k < 24; k += 1) {
      const u = k / 23;
      const x = r3(-80 + 1160 * u);
      const y = r3(heightAt(st, u, 0, s, n) * H);
      pts.push([x, y]);
      d += `${k === 0 ? "M" : "L"}${x} ${y}`;
    }
    paths.push(d);
    for (let b = 0; b < nb; b += 1) {
      const u = (b + 0.5) / nb;
      const f = u * 23;
      const k = Math.min(22, Math.floor(f));
      const a = f - k;
      const p0 = pts[k] ?? [0, 0];
      const p1 = pts[k + 1] ?? p0;
      dots.push({
        x: r3(p0[0] + (p1[0] - p0[0]) * a),
        y: r3(p0[1] + (p1[1] - p0[1]) * a),
        lit: rand() < 0.14 ? 1 : 0,
        tone: Math.floor(rand() * 8) % Math.max(1, tones.length),
      });
    }
  }
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="block size-full bg-background"
    >
      <g
        fill="none"
        strokeWidth="1"
        style={{
          stroke:
            "color-mix(in oklab, var(--foreground) 62%, var(--background))",
        }}
        opacity="0.35"
      >
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {dots.map((dot, i) => (
        <circle
          key={i}
          cx={dot.x}
          cy={dot.y}
          r={dot.lit ? 3 : 1.6}
          opacity={dot.lit ? 1 : 0.5}
          style={{
            fill: dot.lit
              ? (tones[dot.tone] ?? "var(--accent-bright)")
              : "color-mix(in oklab, var(--foreground) 62%, var(--background))",
          }}
        />
      ))}
    </svg>
  );
}
