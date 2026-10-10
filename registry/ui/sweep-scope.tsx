"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SweepScopeColor = "signal" | "cobalt" | "amber" | "ice";
export type SweepScopeOrigin = "bottom" | "center";
export type SweepScopeContact = {
  /** A placed contact's id, counting up from 1. */
  id: number;
  /** Its bearing, degrees clockwise from straight up, 0 to 359. */
  bearing: number;
  /** Its range in rings: 1 is on the first ring. */
  range: number;
};

export type SweepScopeProps = {
  /** The content on top of the scope: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How fast the sweep turns, 0.25 to 3 (1 is a full turn every 4.5 s). @default 1 */
  speed?: number;
  /** How many range rings the scope draws, 1 to 8. @default 4 */
  rings?: number;
  /** The phosphor: a named token or any CSS colour. @default "signal" */
  color?: SweepScopeColor | (string & {});
  /** Where the scope's centre sits: on the bottom edge (the sweep nods across the upper half) or in the middle (it turns full circle). @default "bottom" */
  origin?: SweepScopeOrigin;
  /** How far behind the beam its afterglow reaches, degrees, 20 to 300. @default 110 */
  trail?: number;
  /** How long a contact glows after the beam paints it, ms. @default 2600 */
  persistence?: number;
  /** How many vessels drift across the scope by themselves, 0 to 16. @default 6 */
  contacts?: number;
  /** Ground returns near the centre that the beam lights as it rakes them, 0 to 1. @default 0.35 */
  clutter?: number;
  /** How strongly the rings, spokes and ticks are drawn, 0 to 1. @default 0.6 */
  grid?: number;
  /** Range numbers on the rings and bearings where the spokes leave the frame. @default true */
  labels?: boolean;
  /** A faint range ring and crosshair follow the pointer. @default true */
  cursor?: boolean;
  /** A press, and keyboard focus inside, places a contact for the sweep to find. @default true */
  interactive?: boolean;
  /** Stop the sweep: the scope holds its picture; placed contacts still mark. @default false */
  paused?: boolean;
  /** Seeds the vessels, their courses and the clutter. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a contact is placed, with where it is. */
  onPlace?: (contact: SweepScopeContact) => void;
  /** Fires when the sweep first paints a placed contact. */
  onFind?: (contact: SweepScopeContact) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Line colours from tokens, so the scope keeps its contrast on a light page and a dark one. */
const COLORS: Record<SweepScopeColor, string> = {
  signal: "var(--signal)",
  cobalt: "var(--accent-bright)",
  amber: "var(--warn)",
  ice: "oklch(from var(--accent-bright) l calc(c * 0.55) calc(h - 50))",
};

const GROUND = "var(--background)";
/** Bearing bins round the scope, half a degree each. */
const BINS = 720;
/** The glow layer is drawn at a third of the box's resolution and scaled up smooth. */
const CELL = 3;
const PAINTS = 4;
const PLACED = 6;
/** Seconds for a full turn at speed 1; a sector scan crosses its half in the same angular time. */
const PERIOD = 4.5;
const STEP = 1 / 120;
const PING = 0.7;
/** The marker's brackets close on snap; a found blip lands on recoil. */
const SNAP = springs.snap;
const RECOIL = springs.recoil;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** Bearing of (dx, dy) from the centre, degrees clockwise from up, 0 to 360. */
const bearingOf = (dx: number, dy: number) => {
  const b = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return b < 0 ? b + 360 : b;
};
/** The same bearing as −180 to 180, for the sector scan. */
const signed = (b: number) => (b > 180 ? b - 360 : b);
const binOf = (b: number) => ((Math.floor(b * 2) % BINS) + BINS) % BINS;

type Config = {
  speed: number;
  rings: number;
  colorKey: string;
  origin: SweepScopeOrigin;
  trail: number;
  persistence: number;
  contacts: number;
  clutter: number;
  grid: number;
  labels: boolean;
  cursor: boolean;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onPlace: (c: SweepScopeContact) => void;
  onFind: (c: SweepScopeContact) => void;
};

type Scope = {
  w: number;
  h: number;
  dpr: number;
  ox: number;
  oy: number;
  /** The outer edge of the scope, and the distance between rings. */
  reach: number;
  ring: number;
  gw: number;
  gh: number;
  /** Per glow cell: its bearing bin, how far inside the scope it is, and its clutter. */
  bin: Uint16Array;
  inside: Float32Array;
  ground: Float32Array;
  image: ImageData;
  glow: HTMLCanvasElement;
  face: HTMLCanvasElement;
};

type Vessel = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Ring buffer of paints: x, y and scan time, newest at `at`. */
  px: Float32Array;
  py: Float32Array;
  pt: Float32Array;
  at: number;
};

type Placed = Vessel & {
  on: boolean;
  id: number;
  found: boolean;
  /** Marker bracket half-size and its spin; blip scale and its spin; ping age. */
  bracket: number;
  bracketV: number;
  blip: number;
  blipV: number;
  ping: number;
  fade: number;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  hover: (x: number, y: number) => void;
  leave: () => void;
  place: (x: number, y: number) => void;
  dispose: () => void;
};

const vessel = (): Vessel => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  px: new Float32Array(PAINTS),
  py: new Float32Array(PAINTS),
  pt: new Float32Array(PAINTS).fill(-1e9),
  at: 0,
});

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let scope: Scope | null = null;
  const ctx = canvas.getContext("2d", { alpha: false });
  let frame = 0;
  let last = 0;
  let disposed = false;
  /** Scan time: what the beam and the afterglow run on. It stops when paused. */
  let scan = 0;
  /**
   * How far the beam has travelled, degrees: a speed change only changes how
   * fast this grows, so the beam never jumps.
   */
  let travel = 0;
  let started = false;
  let origin: SweepScopeOrigin = "bottom";
  /** Where the beam is, degrees (unwrapped for a full turn, signed for a sector). */
  let beam = 0;
  let nextId = 1;
  const lastPass = new Float32Array(BINS).fill(-1e9);
  const bright = new Float32Array(BINS);
  const fleet: Vessel[] = [];
  const placed: Placed[] = Array.from({ length: PLACED }, () => ({
    ...vessel(),
    on: false,
    id: 0,
    found: false,
    bracket: 0,
    bracketV: 0,
    blip: 0,
    blipV: 0,
    ping: -1,
    fade: 0,
  }));
  const sprite = document.createElement("canvas");
  const read = rgbReader();
  const paint = {
    rgb: [0, 0, 0] as [number, number, number],
    ground: "black",
    ring: "white",
    grid: "gray",
    label: "gray",
    font: "monospace",
  };
  const pointer = { x: 0, y: 0, present: false };
  let rand = lcg(1);

  const angularSpeed = () => (360 / PERIOD) * clamp(cfg?.speed ?? 1, 0.25, 3);
  /** The afterglow's time constant: it is down to 5 % `trail` degrees behind the beam. */
  const trailTau = () => clamp(cfg?.trail ?? 110, 20, 300) / angularSpeed() / 3;
  const paintTau = () => Math.max(0.2, (cfg?.persistence ?? 2600) / 1000 / 3);

  /** The beam's bearing after `deg` degrees of travel. */
  const beamFrom = (deg: number) => {
    if (cfg?.origin === "center") return deg;
    // The sector scan nods across −90…90, easing a little at each end.
    const p = (deg / 180) % 2;
    const s = p < 1 ? p : 2 - p;
    const eased = s + (s * s * (3 - 2 * s) - s) * 0.35;
    return -90 + 180 * eased;
  };

  /** How long ago, s, the beam last crossed bearing `deg` (0–360), had it always been sweeping. */
  const sinceAt = (deg: number) => {
    const w = angularSpeed();
    if (cfg?.origin === "center") {
      return ((((beam - deg) % 360) + 360) % 360) / w;
    }
    const b = signed(deg);
    if (b < -90 || b > 90) return Infinity;
    const rising = (travel / 180) % 2 < 1;
    // Back along the nod: through the bins behind the beam, then to the end
    // it turned at and back out to this one.
    if (rising) return (b <= beam ? beam - b : beam + 90 + (b + 90)) / w;
    return (b >= beam ? b - beam : 90 - beam + (90 - b)) / w;
  };

  /**
   * The picture the scope would show had it been sweeping all along: the
   * afterglow behind the beam and every vessel at its last paint. The first
   * frame, a resize and reduced motion's still frame all start from it.
   */
  const prefill = () => {
    const s = scope;
    for (let b = 0; b < BINS; b += 1) {
      const ago = sinceAt(b / 2);
      lastPass[b] = ago === Infinity ? -1e9 : scan - ago;
    }
    if (!s) return;
    for (const v of fleet) {
      v.pt.fill(-1e9);
      const ago = sinceAt(bearingOf(v.x - s.ox, v.y - s.oy));
      if (ago === Infinity) continue;
      v.at = 0;
      v.px[0] = v.x;
      v.py[0] = v.y;
      v.pt[0] = scan - ago;
    }
  };

  const inView = (x: number, y: number) => {
    const s = scope;
    if (!s) return false;
    const r = Math.hypot(x - s.ox, y - s.oy);
    return x >= -8 && y >= -8 && x <= s.w + 8 && y <= s.h + 8 && r < s.reach;
  };

  /** A vessel enters somewhere in view, on a slow seeded course. */
  const launch = (v: Vessel, anywhere: boolean) => {
    const s = scope;
    if (!s) return;
    for (let tries = 0; tries < 12; tries += 1) {
      const x = anywhere
        ? s.w * (0.06 + 0.88 * rand())
        : rand() < 0.5
          ? -6
          : s.w + 6;
      const y = s.h * (0.08 + 0.8 * rand());
      const r = Math.hypot(x - s.ox, y - s.oy);
      if (r < s.reach * 0.18 || (anywhere && !inView(x, y))) continue;
      v.x = x;
      v.y = y;
      const heading = anywhere
        ? rand() * Math.PI * 2
        : x < 0
          ? (rand() - 0.5) * 0.8
          : Math.PI + (rand() - 0.5) * 0.8;
      const knots = 5 + rand() * 11;
      v.vx = Math.cos(heading) * knots;
      v.vy = Math.sin(heading) * knots * 0.6;
      v.pt.fill(-1e9);
      return;
    }
  };

  const reseed = () => {
    const c = cfg;
    if (!c || !scope) return;
    rand = lcg(c.seed * 41 + 9);
    fleet.length = 0;
    const n = clamp(Math.round(c.contacts), 0, 16);
    for (let i = 0; i < n; i += 1) {
      const v = vessel();
      launch(v, true);
      fleet.push(v);
    }
  };

  /** The scope face: ground, rings, spokes, ticks and labels, drawn once per layout or theme. */
  const drawFace = () => {
    const s = scope;
    const c = cfg;
    const f = s?.face.getContext("2d");
    if (!s || !c || !f) return;
    s.face.width = Math.max(1, Math.round(s.w * s.dpr));
    s.face.height = Math.max(1, Math.round(s.h * s.dpr));
    f.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    f.fillStyle = paint.ground;
    f.fillRect(0, 0, s.w, s.h);
    const tint = f.createRadialGradient(s.ox, s.oy, 0, s.ox, s.oy, s.reach);
    const [r, g, b] = paint.rgb;
    tint.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.07)`);
    tint.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    f.fillStyle = tint;
    f.fillRect(0, 0, s.w, s.h);
    const strength = clamp(c.grid, 0, 1);
    const rings = clamp(Math.round(c.rings), 1, 8);
    const sector = c.origin === "bottom";
    const from = sector ? -Math.PI : 0;
    const to = sector ? 0 : Math.PI * 2;
    f.strokeStyle = paint.grid;
    f.lineWidth = 1;
    f.globalAlpha = strength;
    f.beginPath();
    for (let k = 1; k <= rings; k += 1) {
      const rr = s.ring * k;
      f.moveTo(s.ox + rr * Math.cos(from), s.oy + rr * Math.sin(from));
      f.arc(s.ox, s.oy, rr, from, to);
    }
    f.stroke();
    // Spokes every 30°, faint; ticks every 10° on each ring.
    f.globalAlpha = strength * 0.55;
    f.beginPath();
    for (let a = 0; a < 360; a += 30) {
      if (sector && a > 90 && a < 270) continue;
      const t = ((a - 90) * Math.PI) / 180;
      f.moveTo(s.ox, s.oy);
      f.lineTo(s.ox + s.reach * Math.cos(t), s.oy + s.reach * Math.sin(t));
    }
    f.stroke();
    f.globalAlpha = strength * 0.8;
    f.beginPath();
    for (let k = 1; k <= rings; k += 1) {
      const rr = s.ring * k;
      for (let a = 0; a < 360; a += 10) {
        if (sector && a > 90 && a < 270) continue;
        const t = ((a - 90) * Math.PI) / 180;
        const len = a % 30 === 0 ? 5 : 3;
        f.moveTo(s.ox + rr * Math.cos(t), s.oy + rr * Math.sin(t));
        f.lineTo(
          s.ox + (rr - len) * Math.cos(t),
          s.oy + (rr - len) * Math.sin(t),
        );
      }
    }
    f.stroke();
    f.globalAlpha = 1;
    if (c.labels && s.w >= 280) {
      f.fillStyle = paint.label;
      f.globalAlpha = 0.45 + 0.5 * strength;
      f.font = `500 9px ${paint.font}`;
      f.textBaseline = "middle";
      f.textAlign = "left";
      // Range: the ring number, just right of the straight-up spoke.
      for (let k = 1; k <= rings; k += 1) {
        const y = s.oy - s.ring * k + 7;
        // Clear of the bearing printed where the upright spoke leaves the top.
        if (y < 24 || y > s.h - 8) continue;
        f.fillText(String(k), s.ox + 4, y);
      }
      // Bearings where each spoke leaves the frame.
      f.textAlign = "center";
      for (let a = 0; a < 360; a += 30) {
        if (sector && a > 90 && a < 270) continue;
        const t = ((a - 90) * Math.PI) / 180;
        const dx = Math.cos(t);
        const dy = Math.sin(t);
        let len = s.reach;
        const pad = 12;
        if (dx > 1e-6) len = Math.min(len, (s.w - pad - s.ox) / dx);
        if (dx < -1e-6) len = Math.min(len, (pad - s.ox) / dx);
        if (dy > 1e-6) len = Math.min(len, (s.h - pad - s.oy) / dy);
        if (dy < -1e-6) len = Math.min(len, (pad - s.oy) / dy);
        if (len < s.ring * 0.6) continue;
        // Kept wholly inside the frame, clear of the bottom and side edges.
        f.fillText(
          String(a).padStart(3, "0"),
          clamp(s.ox + dx * len, 14, s.w - 14),
          clamp(s.oy + dy * len, 10, s.h - 9),
        );
      }
      f.globalAlpha = 1;
    }
  };

  /** The sprite every blip is drawn from: a hot core in a soft glow. */
  const drawSprite = () => {
    const s = scope;
    const g = sprite.getContext("2d");
    if (!s || !g) return;
    const size = Math.round(28 * s.dpr);
    sprite.width = size;
    sprite.height = size;
    const [r, gg, b] = paint.rgb;
    const half = size / 2;
    const glow = g.createRadialGradient(half, half, 0, half, half, half);
    glow.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 1)`);
    glow.addColorStop(0.16, `rgba(${r}, ${gg}, ${b}, 0.95)`);
    glow.addColorStop(0.3, `rgba(${r}, ${gg}, ${b}, 0.32)`);
    glow.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    g.clearRect(0, 0, size, size);
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
  };

  const layout = (): boolean => {
    const c = cfg;
    if (!c) return false;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const sector = c.origin === "bottom";
    const ox = w / 2;
    const oy = sector ? h - 1 : h / 2;
    const reach = sector ? Math.hypot(w / 2, h) : Math.hypot(w / 2, h / 2);
    const rings = clamp(Math.round(c.rings), 1, 8);
    const ring = (reach * 0.94) / rings;
    const gw = Math.max(1, Math.ceil(w / CELL));
    const gh = Math.max(1, Math.ceil(h / CELL));
    const bin = new Uint16Array(gw * gh);
    const inside = new Float32Array(gw * gh);
    const ground = new Float32Array(gw * gh);
    const noise = lcg(c.seed * 59 + 1);
    // Clutter: seeded blobs on a coarse lattice, smoothed, near the centre.
    const lw = Math.ceil(gw / 6) + 2;
    const lh = Math.ceil(gh / 6) + 2;
    const lattice = new Float32Array(lw * lh);
    for (let i = 0; i < lattice.length; i += 1) lattice[i] = noise();
    for (let j = 0; j < gh; j += 1) {
      for (let i = 0; i < gw; i += 1) {
        const k = j * gw + i;
        const x = (i + 0.5) * CELL;
        const y = (j + 0.5) * CELL;
        const dx = x - ox;
        const dy = y - oy;
        const r = Math.hypot(dx, dy);
        bin[k] = binOf(bearingOf(dx, dy));
        inside[k] = 1 - clamp((r / reach - 0.94) / 0.06, 0, 1);
        const fx = i / 6;
        const fy = j / 6;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const a = lattice[iy * lw + ix] ?? 0;
        const bb = lattice[iy * lw + ix + 1] ?? 0;
        const cc = lattice[(iy + 1) * lw + ix] ?? 0;
        const d = lattice[(iy + 1) * lw + ix + 1] ?? 0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const v =
          a + (bb - a) * sx + (cc - a) * sy + (a - bb - cc + d) * sx * sy;
        const near = Math.exp(-r / (reach * 0.28));
        ground[k] = clamp((v - 0.5) * 2.4, 0, 1) * near * (r > 10 ? 1 : 0);
      }
    }
    const glow = scope?.glow ?? document.createElement("canvas");
    glow.width = gw;
    glow.height = gh;
    scope = {
      w,
      h,
      dpr,
      ox,
      oy,
      reach,
      ring,
      gw,
      gh,
      bin,
      inside,
      ground,
      image: new ImageData(gw, gh),
      glow,
      face: scope?.face ?? document.createElement("canvas"),
    };
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    reseed();
    for (const p of placed) p.on = false;
    if (!c.motionSafe) composeStill();
    else {
      // The first layout starts mid-nod, a third of the way across; later
      // ones (a resize, a new origin) carry on from where the beam is. Either
      // way the picture is filled in, so no frame starts blank.
      if (!started || origin !== c.origin)
        travel = c.origin === "center" ? 300 : 60;
      started = true;
      origin = c.origin;
      beam = beamFrom(travel);
      prefill();
    }
    drawFace();
    drawSprite();
    return true;
  };

  /** Reduced motion: the beam parked, its afterglow as if it had just swept. */
  const composeStill = () => {
    const c = cfg;
    if (!c) return;
    // Parked a little right of straight up (or north-east on a full turn),
    // having just swept there.
    travel = c.origin === "center" ? 58 : 128;
    beam = beamFrom(travel);
    scan = 100;
    prefill();
  };

  const record = (v: Vessel) => {
    v.at = (v.at + 1) % PAINTS;
    v.px[v.at] = v.x;
    v.py[v.at] = v.y;
    v.pt[v.at] = scan;
  };

  /** Whether bearing b was crossed by the beam moving from a to z this frame. */
  const crossed = (b: number, a: number, z: number) => {
    if (cfg?.origin === "center") {
      const lo = Math.min(a, z);
      const hi = Math.max(a, z);
      const k = Math.ceil((lo - b) / 360);
      return b + 360 * k <= hi && b + 360 * k > lo;
    }
    const sb = signed(b);
    return (sb > a && sb <= z) || (sb < a && sb >= z);
  };

  const report = (p: Placed): SweepScopeContact => {
    const s = scope;
    const dx = p.x - (s?.ox ?? 0);
    const dy = p.y - (s?.oy ?? 0);
    return {
      id: p.id,
      bearing: Math.round(bearingOf(dx, dy)) % 360,
      range: r1(Math.hypot(dx, dy) / Math.max(1, s?.ring ?? 1)),
    };
  };

  /** Advances the scan and every animation. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const s = scope;
    const c = cfg;
    if (!s || !c) return false;
    const running = !c.paused && c.motionSafe;
    let moving = false;
    if (running) {
      const from = beam;
      scan += dt;
      travel += angularSpeed() * dt;
      beam = beamFrom(travel);
      const to = beam;
      // Mark every half-degree the beam passed.
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      for (let d = Math.ceil(lo * 2) / 2; d <= hi; d += 0.5) {
        lastPass[binOf(((d % 360) + 360) % 360)] = scan;
      }
      for (const v of fleet) {
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        if (!inView(v.x, v.y)) launch(v, false);
        const b = bearingOf(v.x - s.ox, v.y - s.oy);
        if (crossed(b, from, to)) record(v);
      }
      for (const p of placed) {
        if (!p.on) continue;
        const b = bearingOf(p.x - s.ox, p.y - s.oy);
        if (crossed(b, from, to)) {
          record(p);
          if (!p.found) {
            p.found = true;
            p.blip = 0;
            p.blipV = 0;
            p.ping = 0;
            c.onFind(report(p));
          }
        }
      }
      moving = true;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (const p of placed) {
      if (!p.on) continue;
      if (!c.motionSafe) {
        p.bracket = 9;
        p.bracketV = 0;
        p.blip = 1;
        p.blipV = 0;
        p.ping = -1;
        continue;
      }
      for (let k = 0; k < steps; k += 1) {
        p.bracketV +=
          ((SNAP.stiffness * (9 - p.bracket) - SNAP.damping * p.bracketV) /
            SNAP.mass) *
          h;
        p.bracket += p.bracketV * h;
        if (p.found) {
          p.blipV +=
            ((RECOIL.stiffness * (1 - p.blip) - RECOIL.damping * p.blipV) /
              RECOIL.mass) *
            h;
          p.blip += p.blipV * h;
        }
      }
      if (Math.abs(9 - p.bracket) + Math.abs(p.bracketV) > 0.01) moving = true;
      else {
        p.bracket = 9;
        p.bracketV = 0;
      }
      if (p.found) {
        if (Math.abs(1 - p.blip) + Math.abs(p.blipV) > 0.002) moving = true;
        else {
          p.blip = 1;
          p.blipV = 0;
        }
        p.fade = Math.min(1, p.fade + dt / 0.4);
        if (p.fade < 1) moving = true;
      }
      if (p.ping >= 0) {
        p.ping += dt;
        if (p.ping > PING) p.ping = -1;
        else moving = true;
      }
    }
    return moving;
  };

  const blip = (x: number, y: number, alpha: number, scale: number) => {
    const s = scope;
    if (!s || !ctx || alpha < 0.01) return;
    const size = 28 * scale;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
  };

  const draw = () => {
    const s = scope;
    const c = cfg;
    if (!s || !c || !ctx || !visible.current) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(s.face, 0, 0);
    // The afterglow and the clutter it lights, into the third-size buffer.
    const tau = trailTau();
    for (let b = 0; b < BINS; b += 1) {
      const age = scan - (lastPass[b] ?? -1e9);
      bright[b] = age < 0 ? 0 : Math.exp(-age / tau);
    }
    const data = s.image.data;
    const [r, g, bl] = paint.rgb;
    const clutter = clamp(c.clutter, 0, 1);
    for (let k = 0; k < s.gw * s.gh; k += 1) {
      const lit = bright[s.bin[k] ?? 0] ?? 0;
      const a =
        lit * (s.inside[k] ?? 0) * (0.2 + 0.75 * clutter * (s.ground[k] ?? 0));
      const o = k * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = bl;
      data[o + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
    const gctx = s.glow.getContext("2d");
    gctx?.putImageData(s.image, 0, 0);
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(s.glow, 0, 0, s.gw, s.gh, 0, 0, s.gw * CELL, s.gh * CELL);
    // The beam: a crisp line in a soft halo.
    const t = ((beam - 90) * Math.PI) / 180;
    const ex = s.ox + s.reach * Math.cos(t);
    const ey = s.oy + s.reach * Math.sin(t);
    ctx.strokeStyle = paint.ring;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(s.ox, s.oy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    // Blips: each paint fades over the persistence; the newest is hottest.
    const ptau = paintTau();
    for (const v of fleet) {
      for (let i = 0; i < PAINTS; i += 1) {
        const age = scan - (v.pt[i] ?? -1e9);
        if (age < 0 || age > ptau * 6) continue;
        blip(
          v.px[i] ?? 0,
          v.py[i] ?? 0,
          Math.exp(-age / ptau),
          i === v.at ? 0.62 : 0.48,
        );
      }
    }
    for (const p of placed) {
      if (!p.on) continue;
      const still = !c.motionSafe;
      if (p.found) {
        for (let i = 0; i < PAINTS; i += 1) {
          const age = scan - (p.pt[i] ?? -1e9);
          if (!still && (age < 0 || age > ptau * 6)) continue;
          const alpha = still ? 1 : Math.exp(-age / ptau);
          blip(
            p.px[i] ?? 0,
            p.py[i] ?? 0,
            alpha,
            0.7 * (i === p.at ? p.blip : 1),
          );
        }
      }
      // The marker: four corner brackets that closed in when it was placed.
      const b = p.bracket;
      const arm = 3.5;
      ctx.globalAlpha = 0.8 * (1 - 0.65 * p.fade);
      ctx.strokeStyle = paint.ring;
      ctx.lineWidth = 1.25;
      ctx.lineCap = "butt";
      ctx.beginPath();
      for (let q = 0; q < 4; q += 1) {
        const sx = q & 1 ? 1 : -1;
        const sy = q & 2 ? 1 : -1;
        ctx.moveTo(p.x + sx * b, p.y + sy * (b - arm));
        ctx.lineTo(p.x + sx * b, p.y + sy * b);
        ctx.lineTo(p.x + sx * (b - arm), p.y + sy * b);
      }
      ctx.stroke();
      if (p.ping >= 0) {
        const k = p.ping / PING;
        const eased = 1 - (1 - k) ** 3;
        ctx.globalAlpha = 0.7 * (1 - k);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 + 20 * eased, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // The cursor: a range ring through the pointer and a small crosshair.
    if (c.cursor && pointer.present && c.interactive) {
      const range = Math.hypot(pointer.x - s.ox, pointer.y - s.oy);
      ctx.strokeStyle = paint.ring;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(s.ox, s.oy, range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      const gap = 3;
      const len = 5;
      ctx.moveTo(pointer.x - gap - len, pointer.y);
      ctx.lineTo(pointer.x - gap, pointer.y);
      ctx.moveTo(pointer.x + gap, pointer.y);
      ctx.lineTo(pointer.x + gap + len, pointer.y);
      ctx.moveTo(pointer.x, pointer.y - gap - len);
      ctx.lineTo(pointer.x, pointer.y - gap);
      ctx.moveTo(pointer.x, pointer.y + gap);
      ctx.lineTo(pointer.x, pointer.y + gap + len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  function tick(now: number) {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !scope) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  }

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!scope || !ctx) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const css = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el) : null;
    };
    paint.ground = css(0)?.color ?? "black";
    paint.ring = css(1)?.color ?? "white";
    paint.grid = css(2)?.color ?? "gray";
    paint.label = css(3)?.color ?? "gray";
    paint.font = css(3)?.fontFamily || "monospace";
    paint.rgb = read(paint.ring);
  };

  let fontsReady = false;

  // A 2D canvas the browser dropped under memory pressure comes back
  // blank: paint it again.
  const onRestored = () => {
    drawFace();
    drawSprite();
    draw();
  };
  canvas.addEventListener("contextrestored", onRestored);

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        readColours();
        if (layout()) draw();
        kick();
        // The labels are drawn in the mono face: once it has loaded, again.
        if (!fontsReady && typeof document !== "undefined" && document.fonts) {
          void document.fonts.ready.then(() => {
            fontsReady = true;
            if (disposed) return;
            readColours();
            drawFace();
            draw();
          });
        }
        return;
      }
      if (was.colorKey !== next.colorKey) {
        readColours();
        drawSprite();
      }
      if (
        was.origin !== next.origin ||
        was.rings !== next.rings ||
        was.dpr !== next.dpr ||
        was.seed !== next.seed ||
        was.motionSafe !== next.motionSafe
      ) {
        layout();
      } else {
        if (was.contacts !== next.contacts) {
          // New vessels arrive already painted, as if the sweep had seen them.
          reseed();
          prefill();
        }
        if (
          was.colorKey !== next.colorKey ||
          was.grid !== next.grid ||
          was.labels !== next.labels
        ) {
          drawFace();
        }
        if (!next.motionSafe && was.trail !== next.trail) composeStill();
      }
      if (!next.interactive) pointer.present = false;
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c || !ctx) return;
      const s = scope;
      const w = root.clientWidth;
      const h = root.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (s && s.w === w && s.h === h && s.dpr === dpr) return;
      if (layout()) {
        draw();
        kick();
      }
    },
    readColours() {
      readColours();
      drawFace();
      drawSprite();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    hover(x, y) {
      const c = cfg;
      if (!c || !c.interactive) return;
      pointer.x = x;
      pointer.y = y;
      pointer.present = true;
      if (c.cursor) {
        if (frame || (!c.paused && c.motionSafe)) kick();
        else draw();
      }
    },
    leave() {
      if (!pointer.present) return;
      pointer.present = false;
      if (frame) return;
      draw();
    },
    place(x, y) {
      const c = cfg;
      const s = scope;
      if (!c || !s || !c.interactive) return;
      // A free slot, or else the oldest placed contact gives way.
      let pick = placed[0];
      for (const p of placed) {
        if (!p.on) {
          pick = p;
          break;
        }
        if (pick && p.id < pick.id) pick = p;
      }
      if (!pick) return;
      pick.on = true;
      pick.id = nextId;
      nextId += 1;
      pick.x = x;
      pick.y = y;
      pick.pt.fill(-1e9);
      pick.at = 0;
      pick.ping = -1;
      pick.fade = 0;
      pick.bracketV = 0;
      if (c.motionSafe) {
        pick.found = false;
        pick.bracket = 17;
        pick.blip = 0;
      } else {
        // Reduced motion: it shows at once, lit, its brackets closed.
        pick.found = true;
        pick.bracket = 9;
        pick.blip = 1;
        pick.fade = 1;
        pick.px[0] = x;
        pick.py[0] = y;
        pick.pt[0] = scan;
      }
      c.onPlace(report(pick));
      if (!c.motionSafe) c.onFind(report(pick));
      kick();
    },
    dispose() {
      disposed = true;
      canvas.removeEventListener("contextrestored", onRestored);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background that is a radar scope, with the content on top in its own
 * layer: range rings with their numbers, faint spokes and ticks, and a beam
 * that nods across the upper half from a centre on the bottom edge (or turns
 * full circle from the middle). Its afterglow is exact rather than smeared:
 * every half-degree of bearing remembers when the beam last crossed it and
 * glows by how long ago, drawn into a third-size buffer and scaled up smooth,
 * and the same layer carries ground clutter near the centre that lights as
 * the beam rakes it. Vessels drift across the scope, but they show only
 * where the beam last painted them, each paint fading so their tracks are
 * dotted behind them.
 *
 * A press places a contact: four corner brackets close in on the snap
 * spring, and nothing shows there until the sweep finds it — then the blip
 * lands on the recoil spring and a ping ring opens. A faint range ring and a
 * crosshair follow the pointer; keyboard focus on a control inside places a
 * contact at the control. Canvas 2D: a face drawn once, one small glow buffer
 * and a sprite per blip a frame; it runs only on screen in a visible page,
 * and paused it stops once the last marker settles. Under reduced motion the
 * beam stands parked with its afterglow drawn as if it had just passed, and a
 * placed contact shows at once.
 */
export function SweepScope({
  children,
  speed = 1,
  rings = 4,
  color = "signal",
  origin = "bottom",
  trail = 110,
  persistence = 2600,
  contacts = 6,
  clutter = 0.35,
  grid = 0.6,
  labels = true,
  cursor = true,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onPlace,
  onFind,
  className,
}: SweepScopeProps) {
  const motionSafe = useMotionSafe();
  const ring = COLORS[color as SweepScopeColor] ?? color;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const placeRef = React.useRef(onPlace);
  const findRef = React.useRef(onFind);

  const config: Config = {
    speed,
    rings,
    colorKey: ring,
    origin,
    trail,
    persistence,
    contacts,
    clutter,
    grid,
    labels,
    cursor,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onPlace: (p) => placeRef.current?.(p),
    onFind: (p) => findRef.current?.(p),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    placeRef.current = onPlace;
    findRef.current = onFind;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
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

  // Size and sighting, bound to the node when it arrives.
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
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.hover(at.x, at.y);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; only the scope takes a contact.
    if (hit && rootRef.current?.contains(hit)) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.place(at.x, at.y);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.leave();
  };

  // Keyboard focus on a control inside places a contact there for the
  // sweep to find, and parks the cursor on it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.hover(at.x, at.y);
    engine.current?.place(at.x, at.y);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.leave();
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/sweep-scope relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/sweep-scope:opacity-0"
        style={standIn(ring, origin, rings)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[
          GROUND,
          ring,
          `color-mix(in oklab, ${ring} 34%, var(--background))`,
          `color-mix(in oklab, ${ring} 62%, var(--background))`,
        ].map((paint, i) => (
          <span
            key={i}
            className="font-mono transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * rings round the scope's centre and a soft wedge of afterglow.
 */
function standIn(
  ring: string,
  origin: SweepScopeOrigin,
  rings: number,
): React.CSSProperties {
  const at = origin === "bottom" ? "50% 100%" : "50% 50%";
  const n = clamp(Math.round(rings), 1, 8);
  const step = Math.round((94 / n) * 100) / 100;
  const line = `color-mix(in oklab, ${ring} 34%, var(--background))`;
  const glow = `color-mix(in oklab, ${ring} 26%, transparent)`;
  return {
    backgroundColor: GROUND,
    backgroundImage: [
      `repeating-radial-gradient(circle farthest-corner at ${at}, transparent 0 calc(${step}% - 1px), ${line} calc(${step}% - 1px) ${step}%)`,
      `conic-gradient(from -52deg at ${at}, transparent 0deg, ${glow} 88deg, transparent 90deg 360deg)`,
    ].join(", "),
  };
}
