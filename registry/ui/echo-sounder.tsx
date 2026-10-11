"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EchoSounderShoal = {
  /** Where along the transect, 0 to 1. */
  at: number;
  /** Depth of the shoal's middle, metres. */
  depth: number;
  /** How tall the shoal is, metres; it is about four times as long. @default 6 */
  size?: number;
  /** How thick the fish are, 0 to 1. @default 0.7 */
  density?: number;
};

export type EchoSounderColors = {
  /** Weak returns: the water column and the surface. */
  water?: string;
  /** The seabed band. */
  bed?: string;
  /** Shoals. */
  shoal?: string;
  /** The launch. */
  boat?: string;
};

export type EchoSounderProps = {
  /** Depths along the transect in metres; the line loops. @default the Coldbrook basin */
  depths?: readonly number[];
  /** Shoals along the transect. @default three shoals over the basin */
  shoals?: readonly EchoSounderShoal[];
  /** Pings a second, 0.25 to 6. @default 2 */
  pingRate?: number;
  /** Return strength, 0 to 1: bolder bands, more clutter. @default 0.6 */
  gain?: number;
  /** Metres from the surface to the bottom edge, 10 to 400. @default 60 */
  depthScale?: number;
  /** How fast the launch is under way, px a second; 0 holds it over one spot. @default 22 */
  speed?: number;
  /** Units for the readout and the scale (depths are given in metres). @default "m" */
  units?: "m" | "ft";
  /** Show the depth scale on the right edge. @default true */
  scale?: boolean;
  /** The launch's place across the box, 0 to 1 (controlled). */
  value?: number;
  /** Where the launch starts when uncontrolled, 0 to 1. @default 0.5 */
  defaultValue?: number;
  /** Fires as the pointer or the arrow keys steer the launch, with its new place. */
  onValueChange?: (value: number) => void;
  /** The inks: text tokens by default, so both themes keep contrast. */
  colors?: EchoSounderColors;
  /** The pointer steers, a click pings, the keys steer and ping. @default true */
  interactive?: boolean;
  /** Hold the launch and the record where they are. @default false */
  paused?: boolean;
  /** A blup at each ping you ask for, pitched by depth, and a quieter one when the echo returns. @default false */
  sound?: boolean;
  /** Seeds the clutter, the speckle and the fish. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires with the depth under the keel (metres) as each ping's echo comes back, and whether you asked for it. */
  onPing?: (depth: number, manual: boolean) => void;
  /** The sounder's accessible name. @default "Echo sounder" */
  label?: string;
  /** No steering and no pings from the visitor. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box. @default "h-52 w-full" */
  className?: string;
};

/** The Coldbrook basin: a shelf, a slope, a ridge, the deep floor and a channel. */
export const defaultEchoSounderDepths: readonly number[] = [
  12, 12.5, 13, 13.2, 14, 16, 19, 23, 27, 31, 34, 36, 35, 31, 28, 27, 29, 33,
  38, 43, 46, 48, 48, 47, 49, 52, 53, 51, 48, 47, 46, 44, 40, 34, 27, 21, 17,
  14, 13, 12.4,
];

export const defaultEchoSounderShoals: readonly EchoSounderShoal[] = [
  { at: 0.18, depth: 9, size: 5, density: 0.8 },
  { at: 0.5, depth: 24, size: 8, density: 0.6 },
  { at: 0.76, depth: 30, size: 5, density: 0.9 },
];

const DEFAULT_COLORS: Required<EchoSounderColors> = {
  water: "var(--accent-bright)",
  bed: "var(--foreground)",
  shoal: "var(--signal)",
  boat: "var(--foreground)",
};

const RAMP = Array.from(".:-=+*#%@");
const SEGMENT = 30;
const SURFACE = 22;
/** Seconds for a pulse to reach the bottom edge; deeper returns arrive later. */
const TRAVEL = 0.42;
const STEP = 1 / 120;

type Kind = 0 | 1 | 2;
const WATER: Kind = 0;
const SHOAL: Kind = 1;
const BED: Kind = 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A nice tick step for a depth scale: 5, 10, 20, 25, 50, 100… */
const tickStep = (span: number) => {
  const raw = span / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / pow;
  const nice =
    unit < 1.5 ? 1 : unit < 2.25 ? 2 : unit < 3.5 ? 2.5 : unit < 7 ? 5 : 10;
  return nice * pow;
};

const fmt = (metres: number, units: "m" | "ft") =>
  units === "ft"
    ? `${(metres * 3.2808).toFixed(0)} ft`
    : `${metres.toFixed(1)} m`;

type Config = {
  depths: readonly number[];
  shoals: readonly EchoSounderShoal[];
  pingRate: number;
  gain: number;
  depthScale: number;
  speed: number;
  units: "m" | "ft";
  interactive: boolean;
  disabled: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
  controlled: number | null;
};

type Column = {
  world: number;
  value: Float32Array;
  kind: Uint8Array;
  /** Sim time the column was painted, for the slow fade of old record. */
  at: number;
  /** A ping the visitor asked for is highlighted for a moment. */
  glow: number;
};

type Ping = {
  t0: number;
  world: number;
  depth: number;
  manual: boolean;
  /** Rows already written. */
  row: number;
  done: boolean;
  echoed: boolean;
};

type Hooks = {
  value: (v: number) => void;
  ping: (depth: number, manual: boolean) => void;
  sound: (kind: "ping" | "echo", depth: number, x: number) => void;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  refont: () => void;
  wake: () => void;
  steer: (x: number) => void;
  nudge: (by: number | "home" | "end") => void;
  ping: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  readout: React.RefObject<HTMLSpanElement | null>,
  visible: React.RefObject<boolean>,
  hooks: React.RefObject<Hooks>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let atlas: HTMLCanvasElement | null = null;
  let inks: string[] = [];
  let family = "ui-monospace, monospace";
  let frame = 0;
  let last = 0;
  let disposed = false;
  let rand = lcg(1);
  // Layout.
  let w = 0;
  let h = 0;
  let dpr = 1;
  let cw = 5;
  let ch = 10;
  let cwD = 10;
  let chD = 20;
  let rows = 0;
  let top = SURFACE;
  let area = 1;
  let columns: Column[] = [];
  // World and launch.
  let t = 0;
  let scroll = 0;
  let boatX = 0;
  let boatV = 0;
  let target = 0.5;
  let nextPing = 0.3;
  const pings: Ping[] = [];
  let shown = "";
  let lastValue = -1;

  const readColours = () => {
    inks = carriers.slice(0, 5).map((el) => getComputedStyle(el).color);
    family = getComputedStyle(canvas).fontFamily || family;
    buildAtlas();
  };

  /** Ramp glyphs in the water, shoal and bed inks, then the grid dot. */
  const buildAtlas = () => {
    if (!ctx) return;
    const a = atlas ?? document.createElement("canvas");
    const chars = [...RAMP, "·", "~"];
    a.width = Math.max(1, chars.length * cwD);
    a.height = Math.max(1, 4 * chD);
    const actx = a.getContext("2d");
    if (!actx) return;
    actx.clearRect(0, 0, a.width, a.height);
    actx.font = `600 ${Math.round((ch / 1.12) * dpr)}px ${family}`;
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    [0, 2, 1, 4].forEach((ink, row) => {
      // Rows: water, shoal, bed, grid.
      actx.fillStyle = inks[ink] ?? "currentColor";
      chars.forEach((c, i) => {
        actx.fillText(c, i * cwD + cwD / 2, row * chD + chD / 2);
      });
    });
    atlas = a;
  };

  const transect = () => {
    const c = cfg;
    const n = Math.max(2, c?.depths.length ?? 2);
    return Math.max(w * 2.5, n * SEGMENT);
  };

  /** The bed's depth in metres at a world x (the line loops). */
  const bedAt = (world: number) => {
    const c = cfg;
    const d = c && c.depths.length >= 2 ? c.depths : defaultEchoSounderDepths;
    const L = transect();
    const u = ((((world % L) + L) % L) / L) * d.length;
    const i = Math.floor(u);
    const f = u - i;
    const a = d[i % d.length] ?? 0;
    const b = d[(i + 1) % d.length] ?? 0;
    const ease = f * f * (3 - 2 * f);
    return Math.max(0.5, a + (b - a) * ease);
  };

  const columnFor = (world: number) => {
    const size = columns.length;
    if (!size) return null;
    const col = columns[((world % size) + size) % size];
    if (!col) return null;
    if (col.world !== world) {
      col.world = world;
      col.value.fill(0);
      col.kind.fill(0);
      col.at = t;
      col.glow = 0;
    }
    return col;
  };

  /** What one row of one beam column returns. */
  const returnAt = (world: number, depth: number, bed: number) => {
    const c = cfg;
    if (!c) return { v: 0, k: WATER };
    const gain = clamp(c.gain, 0, 1);
    const L = transect();
    let v = 0;
    let k: Kind = WATER;
    if (depth < 1.6) v = (0.25 + rand() * 0.5) * (0.4 + gain);
    else if (rand() < 0.03 + gain * 0.05)
      v = 0.12 + rand() * 0.22 * (0.5 + gain);
    for (const s of c.shoals) {
      const size = Math.max(1, s.size ?? 6);
      const sx = clamp(s.at, 0, 1) * L;
      let dx = (((world - sx) % L) + L) % L;
      if (dx > L / 2) dx -= L;
      const hx = Math.exp(-Math.pow(dx / (size * 4), 2));
      const vy = Math.exp(-Math.pow((depth - s.depth) / (size / 2), 2));
      const fish = hx * vy * clamp(s.density ?? 0.7, 0, 1);
      if (fish > 0.08 && rand() < 0.35 + fish * 0.6) {
        const sv = (0.45 + rand() * 0.5) * fish * (0.6 + gain * 0.7);
        if (sv > v) {
          v = sv;
          k = SHOAL;
        }
      }
    }
    if (depth >= bed) {
      const below = depth - bed;
      const band = 1.2 + gain * 1.6;
      const bv =
        below < band
          ? 0.82 + 0.18 * gain
          : (0.82 + 0.18 * gain) *
            Math.exp(-(below - band) / (0.8 + gain * 1.8));
      if (bv > v) {
        v = bv;
        k = BED;
      }
    }
    // The second bottom echo, faint, at twice the depth.
    const second =
      Math.exp(-Math.pow((depth - bed * 2) / 1.3, 2)) * 0.32 * gain;
    if (second > v) {
      v = second;
      k = BED;
    }
    return { v: clamp(v, 0, 1), k };
  };

  /** Paints one whole column at once (reduced motion, and the record at mount). */
  const paintColumn = (world: number, glow = 0) => {
    const col = columnFor(world);
    const c = cfg;
    if (!col || !c) return;
    const bed = bedAt(world * cw);
    for (let r = 0; r < rows; r += 1) {
      const depth = ((r + 0.5) * ch * c.depthScale) / area;
      const { v, k } = returnAt(world * cw, depth, bed);
      col.value[r] = v;
      col.kind[r] = k;
    }
    col.at = t;
    col.glow = glow;
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    w = root.clientWidth;
    h = root.clientHeight;
    if (w < 1 || h < 1) return;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const size = 9;
    ctx.font = `600 ${size}px ${family}`;
    const advance = Math.max(size * 0.58, ctx.measureText("M").width);
    cwD = Math.max(3, Math.round(advance * dpr));
    chD = Math.max(5, Math.round(size * 1.12 * dpr));
    cw = cwD / dpr;
    ch = chD / dpr;
    top = SURFACE;
    area = Math.max(10, h - top);
    rows = Math.max(1, Math.floor(area / ch));
    const count = Math.ceil(w / cw) + 4;
    columns = Array.from({ length: count }, () => ({
      world: -1,
      value: new Float32Array(rows),
      kind: new Uint8Array(rows),
      at: 0,
      glow: 0,
    }));
    rand = lcg(c.seed * 71 + 29);
    target = c.controlled ?? target;
    boatX = target * w;
    boatV = 0;
    pings.length = 0;
    buildAtlas();
    // A designed first frame: the record already runs behind the launch
    // (all of it, under reduced motion, as a finished survey).
    const first = Math.floor(scroll / cw);
    const upto = c.motionSafe ? Math.floor(boatX / cw) : Math.ceil(w / cw);
    for (let i = 0; i <= upto; i += 1) paintColumn(first + i);
  };

  const fire = (manual: boolean) => {
    const c = cfg;
    if (!c) return;
    const world = Math.floor((scroll + boatX) / cw);
    const depth = bedAt(scroll + boatX);
    pings.push({
      t0: t,
      world,
      depth,
      manual,
      row: 0,
      done: false,
      echoed: false,
    });
    if (pings.length > 6) pings.shift();
    if (manual) hooks.current.sound("ping", depth, boatX);
  };

  const sounding = (depth: number, manual: boolean) => {
    const c = cfg;
    if (!c) return;
    const text = fmt(depth, c.units);
    if (text !== shown && readout.current) {
      shown = text;
      readout.current.textContent = text;
    }
    hooks.current.ping(depth, manual);
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    t += dt;
    // The launch follows the pointer on the glide spring.
    const s = springs.glide;
    let left = dt;
    const goal = target * w;
    while (left > 0) {
      const h1 = Math.min(STEP, left);
      left -= h1;
      boatV +=
        ((-s.stiffness * (boatX - goal) - s.damping * boatV) / s.mass) * h1;
      boatX += boatV * h1;
    }
    boatX = clamp(boatX, 0, w);
    scroll += clamp(c.speed, 0, 400) * dt;
    if (t >= nextPing) {
      fire(false);
      nextPing = t + 1 / clamp(c.pingRate, 0.25, 6);
    }
    // Each pulse writes its returns row by row as it passes them.
    for (let p = pings.length - 1; p >= 0; p -= 1) {
      const ping = pings[p];
      if (!ping) continue;
      const age = t - ping.t0;
      const reach = Math.min(rows, Math.floor((age / TRAVEL) * rows));
      if (ping.row < reach) {
        const bed = ping.depth;
        for (const off of [0, -1, 1]) {
          const col = columnFor(ping.world + off);
          if (!col) continue;
          for (let r = ping.row; r < reach; r += 1) {
            const depth = ((r + 0.5) * ch * c.depthScale) / area;
            const { v, k } = returnAt((ping.world + off) * cw, depth, bed);
            const fall = off === 0 ? 1 : 0.55;
            col.value[r] = Math.max((col.value[r] ?? 0) * 0.35, v * fall);
            if (v * fall > 0.05) col.kind[r] = k;
          }
          col.at = t;
          if (ping.manual) col.glow = 1;
        }
        ping.row = reach;
      }
      const bedRow = (ping.depth / c.depthScale) * rows;
      if (!ping.done && ping.row >= Math.min(rows, bedRow)) {
        ping.done = true;
        sounding(ping.depth, ping.manual);
      }
      // The echo is heard when the return reaches the launch again.
      const back = Math.min(1, ping.depth / c.depthScale) * TRAVEL * 2;
      if (ping.manual && !ping.echoed && age >= back) {
        ping.echoed = true;
        hooks.current.sound("echo", ping.depth, boatX);
      }
      if (age > TRAVEL * 2.2 && ping.done) pings.splice(p, 1);
    }
    for (const col of columns) col.glow = Math.max(0, col.glow - dt * 0.8);
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || !atlas) return;
    const img = atlas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const n = RAMP.length;
    const first = Math.floor(scroll / cw);
    const frac = scroll - first * cw;
    const visibleCols = Math.ceil(w / cw) + 1;
    // Chart paper: dotted lines at each scale tick.
    const tick = tickStep(c.depthScale);
    for (let d = tick; d < c.depthScale; d += tick) {
      const r = Math.round((d / c.depthScale) * rows - 0.5);
      if (r < 0 || r >= rows) continue;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < visibleCols; i += 3) {
        const world = first + i;
        if (world % 3 !== 0) continue;
        ctx.drawImage(
          img,
          n * cwD,
          3 * chD,
          cwD,
          chD,
          Math.round((i * cw - frac) * dpr),
          Math.round((top + r * ch) * dpr),
          cwD,
          chD,
        );
      }
    }
    // The record: old columns fade slowly as they scroll away.
    for (let i = 0; i < visibleCols; i += 1) {
      const col =
        columns[
          (((first + i) % columns.length) + columns.length) % columns.length
        ];
      if (!col || col.world !== first + i) continue;
      const age = c.motionSafe ? t - col.at : 0;
      const fade = Math.max(0.35, 1 - age / 60);
      const x = Math.round((i * cw - frac) * dpr);
      for (let r = 0; r < rows; r += 1) {
        const v = col.value[r] ?? 0;
        if (v < 0.05) continue;
        const k = col.kind[r] ?? 0;
        const gi = Math.min(n - 1, Math.floor(v * n));
        ctx.globalAlpha = Math.min(
          1,
          (0.25 + v * 0.8) * fade + col.glow * 0.35,
        );
        ctx.drawImage(
          img,
          gi * cwD,
          k * chD,
          cwD,
          chD,
          x,
          Math.round((top + r * ch) * dpr),
          cwD,
          chD,
        );
      }
    }
    // The surface: a band of swell.
    const swellT = c.motionSafe ? t : 0;
    for (let i = 0; i < visibleCols; i += 1) {
      const x = i * cw - frac;
      const lift = Math.sin((first + i) * 0.55 + swellT * 2.2) * 0.5 + 0.5;
      ctx.globalAlpha = 0.25 + lift * 0.35;
      ctx.drawImage(
        img,
        (n + 1) * cwD,
        0,
        cwD,
        chD,
        Math.round(x * dpr),
        Math.round((top - ch * 0.9 - lift * 1.5) * dpr),
        cwD,
        chD,
      );
    }
    // Pulses going down and their returns coming back.
    const tx = boatX;
    const ty = top - 2;
    ctx.lineCap = "round";
    for (const ping of pings) {
      const age = t - ping.t0;
      const down = (age / TRAVEL) * area;
      const bedY = Math.min(1, ping.depth / c.depthScale) * area;
      const strong = ping.manual ? 1 : 0.6;
      ctx.strokeStyle = inks[0] ?? "currentColor";
      if (down < bedY + 4) {
        const r = Math.max(1, down);
        ctx.globalAlpha = Math.max(
          0,
          (1 - down / Math.max(1, bedY)) * 0.8 * strong + 0.1,
        );
        ctx.lineWidth = (ping.manual ? 2 : 1.2) * dpr;
        ctx.beginPath();
        ctx.arc(
          tx * dpr,
          ty * dpr,
          r * dpr,
          Math.PI / 2 - 0.28,
          Math.PI / 2 + 0.28,
        );
        ctx.stroke();
      } else {
        const up = bedY - (down - bedY);
        if (up > 2) {
          ctx.globalAlpha = 0.28 * strong * (up / Math.max(1, bedY));
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.arc(
            tx * dpr,
            ty * dpr,
            up * dpr,
            Math.PI / 2 - 0.2,
            Math.PI / 2 + 0.2,
          );
          ctx.stroke();
        }
      }
    }
    drawBoat();
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** The launch: a hull, a wheelhouse, a mast and the transducer under the keel. */
  const drawBoat = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const bob = c.motionSafe ? Math.sin(t * 1.7) * 1.1 : 0;
    const pitch = c.motionSafe
      ? clamp(-boatV * 0.0011, -0.16, 0.16) + Math.sin(t * 1.3) * 0.025
      : 0;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.translate(boatX * dpr, (top - 4 + bob) * dpr);
    ctx.rotate(pitch);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = inks[3] ?? "currentColor";
    ctx.strokeStyle = inks[3] ?? "currentColor";
    ctx.beginPath();
    ctx.moveTo(-15, -4);
    ctx.lineTo(15, -4);
    ctx.lineTo(11, 3);
    ctx.lineTo(-12, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-7, -10, 9, 6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, -4);
    ctx.lineTo(5, -15);
    ctx.stroke();
    // The transducer, pointing straight down.
    ctx.beginPath();
    ctx.moveTo(-2, 3);
    ctx.lineTo(2, 3);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const moving = () => {
    const c = cfg;
    if (!c) return false;
    if (!c.motionSafe) return columns.some((col) => col.glow > 0);
    return !c.paused;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (c.motionSafe && !c.paused) step(dt);
    else if (!c.motionSafe) {
      for (const col of columns) col.glow = Math.max(0, col.glow - dt / 0.6);
    }
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const rebuild = () => {
    layout();
    draw();
    kick();
  };

  const setTarget = (v: number, report: boolean) => {
    const c = cfg;
    if (!c) return;
    const next = Math.round(clamp(v, 0, 1) * 1000) / 1000;
    if (report && next !== lastValue) {
      lastValue = next;
      hooks.current.value(next);
    }
    // Controlled: the host's answer moves the launch, through configure.
    if (c.controlled !== null) return;
    target = next;
    if (!c.motionSafe) {
      boatX = target * w;
      draw();
    }
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (next.controlled !== null) {
        target = clamp(next.controlled, 0, 1);
        lastValue = target;
        if (!next.motionSafe) boatX = target * w;
      }
      if (!was) {
        readColours();
        rebuild();
        const depth = bedAt(scroll + boatX);
        shown = fmt(depth, next.units);
        if (readout.current) readout.current.textContent = shown;
        return;
      }
      if (
        was.dpr !== next.dpr ||
        was.seed !== next.seed ||
        was.depthScale !== next.depthScale ||
        was.depths !== next.depths ||
        was.shoals !== next.shoals ||
        was.motionSafe !== next.motionSafe ||
        (!next.motionSafe && was.gain !== next.gain)
      ) {
        rebuild();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.units !== next.units) {
        shown = fmt(bedAt(scroll + boatX), next.units);
        if (readout.current) readout.current.textContent = shown;
      }
      if (was.pingRate !== next.pingRate) {
        nextPing = Math.min(nextPing, t + 1 / clamp(next.pingRate, 0.25, 6));
      }
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c) return;
      const d = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (w === root.clientWidth && h === root.clientHeight && d === dpr)
        return;
      rebuild();
    },
    readColours() {
      readColours();
      draw();
    },
    refont() {
      if (!cfg || !ctx) return;
      readColours();
      rebuild();
    },
    wake() {
      draw();
      kick();
    },
    steer(x) {
      const c = cfg;
      if (!c || !c.interactive || c.disabled || w <= 0) return;
      setTarget(x / w, true);
    },
    nudge(by) {
      const c = cfg;
      if (!c || !c.interactive || c.disabled) return;
      const base = c.controlled ?? target;
      setTarget(by === "home" ? 0 : by === "end" ? 1 : base + by, true);
    },
    ping() {
      const c = cfg;
      if (!c || !c.interactive || c.disabled) return;
      if (c.motionSafe) {
        fire(true);
        nextPing = t + 1 / clamp(c.pingRate, 0.25, 6);
        kick();
        return;
      }
      // Reduced motion: the column under the launch is sounded at once and
      // glows for a moment; the readout updates.
      const world = Math.floor((scroll + boatX) / cw);
      paintColumn(world, 1);
      const depth = bedAt(scroll + boatX);
      hooks.current.sound("ping", depth, boatX);
      sounding(depth, true);
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * The server's frame: a still echogram from integer arithmetic only — the
 * seabed's rows across the width, a speckle of water returns above it.
 */
function standInRows(seed: number, depths: readonly number[], scaleM: number) {
  const rand = lcg(seed * 71 + 29);
  const out: string[] = [];
  const cols = 150;
  const rows = 18;
  const bedRow = (i: number) => {
    const d =
      depths[Math.floor((i / cols) * depths.length) % depths.length] ?? 20;
    return Math.round((d / Math.max(1, scaleM)) * rows);
  };
  for (let r = 0; r < rows; r += 1) {
    let row = "";
    for (let i = 0; i < cols; i += 1) {
      const b = bedRow(i);
      if (r >= b && r < b + 2) row += "#";
      else if (r >= b + 2 && r < b + 4) row += rand() < 0.6 ? ":" : ".";
      else if (r < b && rand() < 0.03) row += ".";
      else row += " ";
    }
    out.push(row);
  }
  return out;
}

/**
 * A survey launch over a chart-recorder echogram drawn in glyph density. The
 * launch rides the top edge after the pointer on springs.glide, pitching with
 * its speed and bobbing on the swell; the seabed scrolls beneath it at
 * `speed`, so the record painted under the keel is carried away behind it.
 * At `pingRate` the sounder pings: a pulse arc descends, and as it passes
 * each depth it writes that depth's return into the column under the beam —
 * surface clutter, water speckle, shoals as clouds of bright marks, the bed a
 * bold band with a sub-bottom tail and a faint second echo — then the return
 * climbs back. A click, Space or Enter pings at once: a brighter pulse, a
 * highlighted column, the readout updated and, with `sound`, a blup pitched
 * by depth and its echo. It is a slider: the arrow keys steer the launch.
 * Under reduced motion the record is a finished still survey and a ping
 * glows the column under the launch.
 */
export function EchoSounder({
  depths = defaultEchoSounderDepths,
  shoals = defaultEchoSounderShoals,
  pingRate = 2,
  gain = 0.6,
  depthScale = 60,
  speed = 22,
  units = "m",
  scale = true,
  value,
  defaultValue = 0.5,
  onValueChange,
  colors,
  interactive = true,
  paused = false,
  sound = false,
  seed = 1,
  dpr = 2,
  onPing,
  label = "Echo sounder",
  disabled = false,
  className,
}: EchoSounderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const [said, setSaid] = React.useState("");
  const palette = { ...DEFAULT_COLORS, ...colors };
  const inkList = [
    palette.water,
    palette.bed,
    palette.shoal,
    palette.boat,
    "var(--ink-3)",
  ];
  const colorKey = inkList.join("|");
  const depthScaleM = clamp(depthScale, 10, 400);
  const stand = React.useMemo(
    () =>
      standInRows(
        seed,
        depths.length >= 2 ? depths : defaultEchoSounderDepths,
        depthScaleM,
      ),
    [seed, depths, depthScaleM],
  );
  const initial = clamp(value ?? defaultValue, 0, 1);
  const shownValue = Math.round(initial * 100);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const readoutRef = React.useRef<HTMLSpanElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const latestProps = React.useRef({
    onValueChange,
    onPing,
    units,
    audio,
    controlled: value !== undefined,
  });
  const hooks = React.useRef<Hooks>({
    value: (v) => {
      const p = latestProps.current;
      // Uncontrolled: the slider's reading is written straight to the node,
      // not through React state, so steering never re-renders the tree.
      const node = rootRef.current;
      if (node && !p.controlled) {
        node.setAttribute("aria-valuenow", String(Math.round(v * 100)));
      }
      p.onValueChange?.(v);
    },
    ping: (depth, manual) => {
      const p = latestProps.current;
      const node = rootRef.current;
      if (node) {
        const pct = Number(node.getAttribute("aria-valuenow") ?? 50);
        node.setAttribute(
          "aria-valuetext",
          `Launch at ${pct}% of the line, ${fmt(depth, p.units).replace(" m", " metres").replace(" ft", " feet")} under the keel`,
        );
      }
      if (manual) {
        setSaid(
          `Depth ${fmt(depth, p.units).replace(" m", " metres").replace(" ft", " feet")}`,
        );
      }
      p.onPing?.(depth, manual);
    },
    sound: (kind, depth, x) => {
      const p = latestProps.current;
      const node = rootRef.current;
      const pan = node
        ? panFrom(node.getBoundingClientRect().left + x, node)
        : 0;
      // Deeper water sounds lower.
      const pitch = clamp(1.35 - (depth / 60) * 0.6, 0.55, 1.4);
      if (kind === "ping") p.audio.play("blup", { pitch, gain: 0.6, pan });
      else p.audio.play("blup", { pitch: pitch * 0.82, gain: 0.28, pan });
    },
  });

  const config: Config = {
    depths: depths.length >= 2 ? depths : defaultEchoSounderDepths,
    shoals,
    pingRate,
    gain,
    depthScale: depthScaleM,
    speed,
    units,
    interactive,
    disabled,
    paused,
    seed,
    dpr,
    colorKey,
    motionSafe,
    controlled: value === undefined ? null : clamp(value, 0, 1),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latestProps.current = {
      onValueChange,
      onPing,
      units,
      audio,
      controlled: value !== undefined,
    };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 5) return;
    const e = createEngine(root, canvas, carriers, readoutRef, visible, hooks);
    engine.current = e;
    e.configure(latest.current);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.refont();
    });
    return () => {
      live = false;
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
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

  const localX = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return event.clientX - r.left - event.currentTarget.clientLeft;
  };

  const inert = disabled || !interactive;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (inert) return;
    const e = engine.current;
    if (!e) return;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowDown") e.nudge(-0.02);
    else if (key === "ArrowRight" || key === "ArrowUp") e.nudge(0.02);
    else if (key === "PageDown") e.nudge(-0.1);
    else if (key === "PageUp") e.nudge(0.1);
    else if (key === "Home") e.nudge("home");
    else if (key === "End") e.nudge("end");
    else if (key === " " || key === "Enter") e.ping();
    else return;
    event.preventDefault();
  };

  const ticks = React.useMemo(() => {
    const stepM = tickStep(depthScaleM);
    const out: { frac: number; text: string }[] = [];
    for (let d = stepM; d < depthScaleM - stepM * 0.25; d += stepM) {
      const shownD = units === "ft" ? Math.round(d * 3.2808) : Math.round(d);
      out.push({
        frac: Math.round((d / depthScaleM) * 1000) / 1000,
        text: `${shownD}`,
      });
    }
    return out;
  }, [depthScaleM, units]);

  return (
    <div
      ref={bindRoot}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shownValue}
      aria-valuetext={`Launch at ${shownValue}% of the line`}
      aria-disabled={inert || undefined}
      tabIndex={inert ? undefined : 0}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (inert) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        engine.current?.steer(localX(event));
      }}
      onPointerDown={(event) => {
        if (inert || event.pointerType !== "touch") return;
        engine.current?.steer(localX(event));
      }}
      onClick={() => {
        if (!inert) engine.current?.ping();
      }}
      className={cn(
        "group/echo-sounder relative isolate h-52 w-full touch-pan-y overflow-clip rounded-3 outline-none select-none",
        inert ? "cursor-default" : "cursor-crosshair",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full font-mono"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 overflow-clip font-mono text-[9px] leading-[10px] whitespace-pre select-none group-data-live/echo-sounder:hidden"
        style={{
          top: SURFACE,
          color: `color-mix(in oklab, ${palette.bed} 55%, transparent)`,
        }}
      >
        {stand.join("\n")}
      </div>
      {scale ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-1.5 font-mono text-[9px] leading-none text-ink-3 tabular-nums"
        >
          {ticks.map((tk) => (
            <span
              key={tk.text}
              className="absolute right-0 -translate-y-1/2"
              style={{
                top: `calc(${SURFACE}px + (100% - ${SURFACE}px) * ${tk.frac})`,
              }}
            >
              {tk.text}
            </span>
          ))}
          <span className="absolute right-0 bottom-1">{units}</span>
        </div>
      ) : null}
      <span
        ref={readoutRef}
        aria-hidden
        className="pointer-events-none absolute top-1 left-2 font-mono text-[10px] leading-4 text-foreground tabular-nums"
      />
      {inkList.map((ink, i) => (
        <span
          key={i}
          ref={(node) => {
            carrierRefs.current[i] = node;
          }}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
          style={{ color: ink }}
        />
      ))}
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
