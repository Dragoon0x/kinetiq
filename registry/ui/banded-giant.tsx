"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BandedGiantCharSet = "classic" | "blocks" | "dots";

export type BandedGiantColors = {
  /** The pale bands. */
  zone?: string;
  /** The darker belts between them. */
  belt?: string;
  /** The storm's oval. */
  storm?: string;
  /** The ring. */
  ring?: string;
};

export type BandedGiantProps = {
  /** How fast the bands shear past one another, 0 (still) to 3. @default 1 */
  bandSpeed?: number;
  /** How far the ring opens toward you, in degrees (−40 to 60); 0 is edge-on. @default 22 */
  ringTilt?: number;
  /** The glyph ramp the light is drawn in. @default "classic" */
  charSet?: BandedGiantCharSet;
  /** How fast the planet turns as a whole, 0 to 3. @default 1 */
  spin?: number;
  /** How many bands cross the disc, 4 to 20. @default 9 */
  bands?: number;
  /** A slow storm turning in the south. @default true */
  storm?: boolean;
  /** The ring, its division and its shadow on the disc. @default true */
  ring?: boolean;
  /** A moon that now and then crosses in front, with its shadow. @default true */
  moon?: boolean;
  /** Seconds for the moon to go once round. @default 14 */
  moonPeriod?: number;
  /** Rows of glyphs across the disc, 14 to 60. @default 20 */
  resolution?: number;
  /** The planet's inks. Pigments at fixed lightness by default, so it reads the same in both themes. */
  colors?: BandedGiantColors;
  /** Drag and the arrow keys spin and tip it. @default true */
  interactive?: boolean;
  /** Hold the bands, the storm and the moon where they are. @default false */
  paused?: boolean;
  /** Seeds the bands, their jets and the turbulence. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires as the moon starts across the disc. */
  onTransit?: () => void;
  /** The planet's accessible name; the ring's opening is added to it. @default "A banded gas giant" */
  label?: string;
  /** Sizes and shapes the box. @default "h-56 w-full" */
  className?: string;
};

const DEFAULT_COLORS: Required<BandedGiantColors> = {
  zone: "oklch(from var(--warn) 0.86 0.05 h)",
  belt: "oklch(from var(--warn) 0.64 0.1 calc(h - 22))",
  storm: "oklch(from var(--danger) 0.62 0.13 calc(h + 12))",
  ring: "oklch(from var(--ink-2) 0.8 0.025 70)",
};

const RAMPS: Record<BandedGiantCharSet, string> = {
  classic: ".:-=+*#%@",
  blocks: "·░▒▓█",
  dots: "·∙•●",
};

/** Ring radii, in planet radii: faint inner, bright middle, a division, outer. */
const RING_IN = 1.3;
const RING_OUT = 2.15;
const ORBIT = 2.5;
const ROLL = (-8 * Math.PI) / 180;
const TIP = (30 * Math.PI) / 180;
const STEP = 1 / 120;

type Ink = 0 | 1 | 2 | 3 | 4;
const ZONE: Ink = 0;
const BELT: Ink = 1;
const STORM: Ink = 2;
const RING: Ink = 3;
const MOON: Ink = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const wrap = (a: number) => {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
};

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Seeded value noise on a lattice, smooth between points. */
function valueNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

/** Ring material at a radius: faint inner ring, bright ringlets, the division, outer ring. */
const ringDensity = (r: number) => {
  if (r < RING_IN || r > RING_OUT) return 0;
  const ringlets = 0.82 + 0.18 * Math.sin(r * 87);
  if (r < 1.52) return 0.3 * ringlets;
  if (r < 1.86) return 0.95 * ringlets;
  if (r < 1.94) return 0.06;
  return 0.66 * ringlets * (1 - smooth(2.08, RING_OUT, r) * 0.6);
};

type Config = {
  bandSpeed: number;
  ringTilt: number;
  charSet: BandedGiantCharSet;
  spin: number;
  bands: number;
  storm: boolean;
  ring: boolean;
  moon: boolean;
  moonPeriod: number;
  resolution: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
};

type View = {
  /** Planet longitude turned by the planet's own spin and the visitor's. */
  turn: number;
  turnV: number;
  /** Tip added to the ring's tilt by the visitor, radians. */
  tip: number;
  tipV: number;
  /** Clock for the bands, the storm and the moon. */
  t: number;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  refont: () => void;
  wake: () => void;
  grab: () => void;
  drag: (dx: number, dy: number) => void;
  drop: (vx: number, vy: number) => void;
  key: (k: "left" | "right" | "up" | "down" | "home") => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
  report: React.RefObject<() => void>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let atlas: HTMLCanvasElement | null = null;
  let ramp: string[] = [];
  let inks: string[] = [];
  let family = "ui-monospace, monospace";
  let frame = 0;
  let last = 0;
  let disposed = false;
  let noise = valueNoise(1);
  let phases = [0, 0, 0, 0];
  // Layout.
  let w = 0;
  let h = 0;
  let dpr = 1;
  let R = 1;
  let cw = 4;
  let ch = 7;
  let cwD = 8;
  let chD = 14;
  let cols = 0;
  let rows = 0;
  let cx = 0;
  let cy = 0;
  const view: View = { turn: 0, turnV: 0, tip: 0, tipV: 0, t: 0 };
  let dragging = false;
  let grabTurn = 0;
  let grabTip = 0;
  let inTransit = false;

  const readColours = () => {
    inks = carriers.slice(0, 5).map((el) => getComputedStyle(el).color);
    family = getComputedStyle(canvas).fontFamily || family;
    buildAtlas();
  };

  const buildAtlas = () => {
    const c = cfg;
    if (!c || !ctx) return;
    ramp = Array.from(RAMPS[c.charSet] ?? RAMPS.classic);
    const chars = [...ramp, "●"];
    const a = atlas ?? document.createElement("canvas");
    a.width = Math.max(1, chars.length * cwD);
    a.height = Math.max(1, 5 * chD);
    const actx = a.getContext("2d");
    if (!actx) return;
    actx.clearRect(0, 0, a.width, a.height);
    actx.font = `600 ${Math.round((ch / 1.08) * dpr)}px ${family}`;
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    inks.forEach((ink, row) => {
      actx.fillStyle = ink;
      chars.forEach((chr, i) => {
        actx.fillText(chr, i * cwD + cwD / 2, row * chD + chD / 2);
      });
    });
    atlas = a;
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
    // The ring's outer edge always fits: across, it spans 2 × RING_OUT radii;
    // up and down, its opened ellipse (rolled a little) or the disc itself.
    const tilt = Math.abs((clamp(c.ringTilt, -40, 60) * Math.PI) / 180);
    const a = RING_OUT;
    const b = RING_OUT * Math.sin(tilt);
    const tall = c.ring
      ? Math.max(
          1,
          Math.sqrt(
            Math.pow(a * Math.sin(ROLL), 2) + Math.pow(b * Math.cos(ROLL), 2),
          ),
        )
      : 1;
    const wide = c.ring ? RING_OUT : 1;
    R = Math.max(
      12,
      Math.min((w * 0.96) / (2 * wide), (h * 0.94) / (2 * tall)),
    );
    const res = clamp(Math.round(c.resolution), 14, 60);
    const size = (2 * R) / res / 1.08;
    ctx.font = `600 ${size}px ${family}`;
    const advance = Math.max(size * 0.55, ctx.measureText("M").width);
    cwD = Math.max(2, Math.round(advance * dpr));
    chD = Math.max(3, Math.round(size * 1.08 * dpr));
    cw = cwD / dpr;
    ch = chD / dpr;
    cols = Math.ceil(w / cw);
    rows = Math.ceil(h / ch);
    cx = w / 2;
    cy = h / 2;
    const r = lcg(c.seed * 61 + 17);
    phases = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
    noise = valueNoise(Math.imul(Math.round(c.seed) | 0, 2246822519) | 0);
    buildAtlas();
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || !atlas) return;
    const img = atlas;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const n = ramp.length;
    const beta = (clamp(c.ringTilt, -40, 60) * Math.PI) / 180 + view.tip;
    const sb = Math.sin(beta);
    const cb = Math.cos(beta);
    // The planet's axis, and the equator's sideways and toward-you directions.
    const Ay = cb;
    const Az = sb;
    const E2y = -sb;
    const E2z = cb;
    // Light from nearly behind the viewer, a little up and to the left: the
    // whole disc lit, a soft terminator down its right limb, and the ring's
    // shadow a band just off the ring.
    const Lx = -0.38;
    const Ly = 0.3;
    const Lz = 0.875;
    const LA = Ly * Ay + Lz * Az;
    const ringLit = 0.25 + 0.75 * Math.abs(LA);
    const bands = clamp(c.bands, 4, 20);
    const speed = clamp(c.bandSpeed, 0, 3);
    const t = view.t;
    const [p1 = 0, p2 = 0, p3 = 0, p4 = 0] = phases;
    const albedo = (s: number) =>
      0.5 +
      0.28 * Math.sin(s * bands * 1.6 + p1) +
      0.14 * Math.sin(s * bands * 3.3 + p2) +
      0.07 * Math.sin(s * 5.1 + p3);
    // Alternating jets: each latitude's own angular speed.
    const jet = (s: number) =>
      speed *
      0.16 *
      (0.35 * Math.cos(s * 2.2) + 0.65 * Math.sin(s * bands * 1.6 + p1 + 1.2));
    const stormS = Math.sin((-22 * Math.PI) / 180);
    const stormLon = p4 + jet(stormS) * t;
    const cosR = Math.cos(ROLL);
    const sinR = Math.sin(ROLL);
    // The moon, on an orbit inclined to the ring plane.
    let moonX = 0;
    let moonY = 0;
    let moonZ = -9;
    let shadowX = 0;
    let shadowY = 0;
    let shadowOn = false;
    if (c.moon) {
      const period = Math.max(2, c.moonPeriod);
      const mu = (t / period) * Math.PI * 2 + p2;
      // Inclined about 17° to the ring plane, so its transits cross the disc
      // rather than graze the limb.
      const inc = 0.3;
      const mx = ORBIT * Math.cos(mu);
      const my = ORBIT * Math.sin(mu) * (E2y + Ay * inc);
      const mz = ORBIT * Math.sin(mu) * (E2z + Az * inc);
      moonX = mx;
      moonY = my;
      moonZ = mz;
      // Its shadow: back along the light onto the cloud tops.
      const bq = -(mx * Lx + my * Ly + mz * Lz);
      const cq = mx * mx + my * my + mz * mz - 1;
      const disc = bq * bq - cq;
      if (disc > 0) {
        const s = -bq - Math.sqrt(disc);
        const sx = mx - s * Lx;
        const sy = my - s * Ly;
        const sz = mz - s * Lz;
        if (s > 0 && sz > 0) {
          shadowOn = true;
          shadowX = sx;
          shadowY = sy;
        }
      }
      const onDisc = moonZ > 0 && moonX * moonX + moonY * moonY < 1;
      if (onDisc && !inTransit) {
        inTransit = true;
        // A parked moon (reduced motion) is a picture, not news.
        if (c.motionSafe) report.current();
      } else if (!onDisc) inTransit = false;
    }
    const put = (gi: number, ink: Ink, i: number, j: number, alpha: number) => {
      if (alpha < 0.03) return;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(
        img,
        gi * cwD,
        ink * chD,
        cwD,
        chD,
        i * cwD,
        j * chD,
        cwD,
        chD,
      );
    };
    for (let j = 0; j < rows; j += 1) {
      const py = (j + 0.5) * ch - cy;
      for (let i = 0; i < cols; i += 1) {
        const px = (i + 0.5) * cw - cx;
        // Undo the roll, then work in planet radii with y up.
        const u = (px * cosR + py * sinR) / R;
        const v = -(-px * sinR + py * cosR) / R;
        const d2 = u * u + v * v;
        const onDisc = d2 < 1;
        const zDisc = onDisc ? Math.sqrt(1 - d2) : -9;
        // Where the line of sight meets the ring plane.
        let ringZ = -99;
        let ringR = 0;
        if (c.ring) {
          if (Math.abs(Az) > 0.015) {
            ringZ = -(v * Ay) / Az;
            ringR = Math.sqrt(u * u + v * v + ringZ * ringZ);
          } else if (Math.abs(v) < (0.55 * ch) / R) {
            // Edge-on, the ring is a line one glyph thick.
            ringZ = 0;
            ringR = Math.abs(u);
          }
        }
        const ringHere = ringDensity(ringR);
        const ringInFront = ringHere > 0 && ringZ > zDisc;
        if (ringInFront) {
          // Lit from either face; dark where the planet's shadow falls on it.
          const qx = u;
          const qy = v;
          const qz = ringZ;
          const bq = qx * Lx + qy * Ly + qz * Lz;
          const cq = qx * qx + qy * qy + qz * qz - 1;
          const shaded = bq < 0 && bq * bq - cq > 0 ? 0.14 : 1;
          // The ring is fine, thin material: lighter glyphs and less ink
          // than the disc, so the planet stays the figure.
          const b = clamp(ringHere * ringLit * shaded, 0, 1);
          const gi = Math.min(n - 1, Math.floor(b * n * 0.62));
          put(gi, RING, i, j, 0.12 + b * 0.55);
          continue;
        }
        if (!onDisc) continue;
        const nx = u;
        const ny = v;
        const nz = zDisc;
        const lambert = nx * Lx + ny * Ly + nz * Lz;
        if (lambert <= 0.02) continue;
        const s = ny * Ay + nz * Az;
        const ex = nx;
        const ey = ny * E2y + nz * E2z;
        const lon = Math.atan2(ex, ey) + view.turn;
        const lonB = lon + jet(s) * t;
        let a = albedo(s);
        const edge = clamp(1 - Math.abs(a - 0.5) * 2.6, 0, 1);
        // Turbulence sampled in each latitude's own advected longitude, on a
        // circle in noise space so it wraps without a seam.
        const k = 2.6;
        const turb =
          noise(
            Math.cos(lonB) * k + s * 3.1,
            Math.sin(lonB) * k + s * bands * 0.9,
          ) - 0.5;
        a += turb * (0.16 + 0.42 * edge);
        let ink: Ink = a > 0.52 ? ZONE : BELT;
        if (c.storm) {
          const dl = wrap(lonB - stormLon) * Math.sqrt(Math.max(0, 1 - s * s));
          const dp = s - stormS;
          const rx = dl / 0.3;
          const ry = dp / 0.11;
          const rr = Math.sqrt(rx * rx + ry * ry);
          if (rr < 1.15) {
            const swirl = Math.atan2(ry, rx) + rr * 3.2 - t * 0.9 * speed;
            const stripe = 0.5 + 0.5 * Math.sin(swirl * 2 + rr * 7);
            const inside = 1 - smooth(0.75, 1.15, rr);
            a = a * (1 - inside) + (0.32 + 0.45 * stripe) * inside;
            if (inside > 0.45) ink = STORM;
          }
        }
        // The ring's shadow on the cloud tops.
        let shade = 1;
        if (c.ring && Math.abs(LA) > 0.01) {
          const tq = -(nx * 0 + ny * Ay + nz * Az) / LA;
          if (tq > 0) {
            const qx = nx + tq * Lx;
            const qy = ny + tq * Ly;
            const qz = nz + tq * Lz;
            shade =
              1 - ringDensity(Math.sqrt(qx * qx + qy * qy + qz * qz)) * 0.8;
          }
        }
        if (shadowOn) {
          const dx = (nx - shadowX) * R;
          const dy = (ny - shadowY) * R;
          if (dx * dx + dy * dy < cw * cw * 1.3) shade *= 0.1;
        }
        const limb = 0.62 + 0.38 * Math.sqrt(nz);
        const b = clamp(
          (0.1 + 0.9 * Math.pow(lambert, 0.85)) *
            (0.4 + 0.6 * clamp(a, 0, 1)) *
            limb *
            shade,
          0,
          1,
        );
        if (b < 0.05) continue;
        const gi = Math.min(n - 1, Math.floor(b * n));
        put(gi, ink, i, j, 0.42 + b * 0.7);
      }
    }
    // The moon: one bright character, hidden behind the disc.
    if (c.moon) {
      const hidden = moonZ < 0 && moonX * moonX + moonY * moonY < 1;
      if (!hidden) {
        const sx = moonX * R;
        const sy = -moonY * R;
        const x = cx + sx * cosR - sy * sinR;
        const y = cy + sx * sinR + sy * cosR;
        if (x > -cw && x < w + cw && y > -ch && y < h + ch) {
          ctx.globalAlpha = 1;
          ctx.drawImage(
            img,
            n * cwD,
            MOON * chD,
            cwD,
            chD,
            Math.round(x * dpr - cwD / 2),
            Math.round(y * dpr - chD / 2),
            cwD,
            chD,
          );
        }
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const moving = () => {
    const c = cfg;
    if (!c) return false;
    const flows = c.bandSpeed > 0 || c.spin > 0 || c.moon;
    return (
      dragging ||
      (c.motionSafe &&
        ((!c.paused && flows) ||
          Math.abs(view.turnV) > 0.002 ||
          Math.abs(view.tip) > 0.0005 ||
          Math.abs(view.tipV) > 0.002))
    );
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    if (!c.paused) {
      view.t += dt;
      view.turn += clamp(c.spin, 0, 3) * 0.12 * dt;
    }
    if (dragging || !c.motionSafe) return;
    // A throw coasts and slows; a tip springs home on the drift spring.
    view.turn += view.turnV * dt;
    view.turnV *= Math.exp(-dt / 1.1);
    const s = springs.drift;
    let left = dt;
    while (left > 0) {
      const h1 = Math.min(STEP, left);
      left -= h1;
      view.tipV +=
        ((-s.stiffness * view.tip - s.damping * view.tipV) / s.mass) * h1;
      view.tip += view.tipV * h1;
    }
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
    step(dt);
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
        layout();
        // A designed first frame. Live, the moon is in front just off the
        // disc's right edge and starts across it about a second in; under
        // reduced motion it is parked on the disc with its shadow beside it.
        const period = Math.max(2, next.moonPeriod);
        const mu = next.motionSafe ? Math.PI / 2 - 0.9 : Math.PI / 2 - 0.3;
        const turns = (mu - (phases[1] ?? 0)) / (Math.PI * 2);
        view.t = (turns - Math.floor(turns)) * period;
        draw();
        kick();
        return;
      }
      if (
        was.resolution !== next.resolution ||
        was.dpr !== next.dpr ||
        was.seed !== next.seed ||
        was.ringTilt !== next.ringTilt ||
        was.ring !== next.ring
      ) {
        rebuild();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      else if (was.charSet !== next.charSet) buildAtlas();
      if (was.motionSafe !== next.motionSafe) {
        view.turnV = 0;
        view.tipV = 0;
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
    grab() {
      dragging = true;
      grabTurn = view.turn;
      grabTip = view.tip;
      view.turnV = 0;
      view.tipV = 0;
      kick();
    },
    drag(dx, dy) {
      // One disc radius of travel is one radian; the tip rubber-bands.
      view.turn = grabTurn - dx / R;
      const raw = grabTip + dy / R;
      view.tip =
        raw > TIP
          ? TIP + rubberband(raw - TIP, 1)
          : raw < -TIP
            ? -TIP + rubberband(raw + TIP, 1)
            : raw;
      draw();
      kick();
    },
    drop(vx, vy) {
      dragging = false;
      if (cfg?.motionSafe) {
        view.turnV = clamp(-vx / R, -8, 8);
        view.tipV = clamp(vy / R, -8, 8);
      } else {
        view.tip = clamp(view.tip, -TIP, TIP);
      }
      kick();
    },
    key(k) {
      const c = cfg;
      if (!c) return;
      if (c.motionSafe) {
        if (k === "left") view.turnV += 1.6;
        else if (k === "right") view.turnV -= 1.6;
        else if (k === "up") view.tipV -= 1.4;
        else if (k === "down") view.tipV += 1.4;
        else view.turnV = 0;
      } else {
        // Reduced motion: whole steps, nothing coasts or springs.
        const deg = Math.PI / 180;
        if (k === "left") view.turn += 15 * deg;
        else if (k === "right") view.turn -= 15 * deg;
        else if (k === "up") view.tip = clamp(view.tip - 6 * deg, -TIP, TIP);
        else if (k === "down") view.tip = clamp(view.tip + 6 * deg, -TIP, TIP);
        else view.tip = 0;
        draw();
      }
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
 * The server's frame: a banded disc and an open ring in glyphs, from
 * arithmetic and square roots only (no trigonometry), so Node and the
 * browser draw the same characters.
 */
function standInRows(ramp: string) {
  const chars = Array.from(ramp);
  const n = chars.length;
  const rows: string[] = [];
  const H = 25;
  const W = 92;
  for (let j = 0; j < H; j += 1) {
    let row = "";
    for (let i = 0; i < W; i += 1) {
      const u = ((i - W / 2 + 0.5) * 0.55) / 11;
      const v = (H / 2 - j - 0.5) / 11;
      const d2 = u * u + v * v;
      const e = (u * u) / (2.1 * 2.1) + (v * v) / (0.8 * 0.8);
      const ring = e > 0.55 && e < 1 && (d2 > 1 || v < 0);
      if (d2 < 1) {
        const z = Math.sqrt(1 - d2);
        const lambert = -0.38 * u + 0.3 * v + 0.875 * z;
        const band = Math.floor((v + 1) * 4.5) % 2 === 0 ? 1 : 0.62;
        if (ring) {
          row += chars[n - 3] ?? "-";
          continue;
        }
        const b = lambert > 0 ? lambert * band : 0;
        row +=
          b > 0.05 ? (chars[Math.min(n - 1, Math.floor(b * n))] ?? ".") : " ";
      } else row += ring ? (chars[Math.floor(n / 2)] ?? "-") : " ";
    }
    rows.push(row);
  }
  return rows;
}

/**
 * A banded gas giant drawn per glyph cell on Canvas 2D: each cell's centre is
 * cast onto the sphere and the ring plane, its glyph picked by the light it
 * receives and its ink by what it hit — pale zone, darker belt, the storm, the
 * ring. Every latitude flows at its own speed (alternating jets), and the
 * turbulence is sampled in each latitude's own advected longitude, so the
 * bands shear past one another; a storm turns in the south, the ring's shadow
 * falls across the disc and the planet's shadow across the ring, and now and
 * then a moon crosses in front as a single bright character with its shadow
 * beside it.
 *
 * Drag sideways to spin it 1:1 (a throw coasts), drag up or down to tip it
 * (rubber-banded, and back on springs.drift with the release velocity); the
 * arrow keys do the same. Under reduced motion the bands, storm and moon are
 * still, a drag turns it 1:1 and keys turn it in whole steps.
 */
export function BandedGiant({
  bandSpeed = 1,
  ringTilt = 22,
  charSet = "classic",
  spin = 1,
  bands = 9,
  storm = true,
  ring = true,
  moon = true,
  moonPeriod = 14,
  resolution = 20,
  colors,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onTransit,
  label = "A banded gas giant",
  className,
}: BandedGiantProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [said, setSaid] = React.useState("");
  const palette = { ...DEFAULT_COLORS, ...colors };
  const inkList = [
    palette.zone,
    palette.belt,
    palette.storm,
    palette.ring,
    "var(--foreground)",
  ];
  const colorKey = inkList.join("|");
  const ramp = RAMPS[charSet] ?? RAMPS.classic;
  const stand = React.useMemo(() => standInRows(ramp), [ramp]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callback = React.useRef(onTransit);
  const report = React.useRef<() => void>(() => {
    setSaid((s) =>
      s === "A moon is crossing the disc."
        ? "A moon is crossing the disc again."
        : "A moon is crossing the disc.",
    );
    callback.current?.();
  });

  const config: Config = {
    bandSpeed,
    ringTilt,
    charSet,
    spin,
    bands,
    storm,
    ring,
    moon,
    moonPeriod,
    resolution,
    interactive,
    paused,
    seed,
    dpr,
    colorKey,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callback.current = onTransit;
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
    const e = createEngine(root, canvas, carriers, visible, report);
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

  const drag = useDrag({
    threshold: 3,
    disabled: !interactive,
    onStart: () => engine.current?.grab(),
    onMove: ({ offset }) => engine.current?.drag(offset.x, offset.y),
    onEnd: ({ velocity }) => engine.current?.drop(velocity.x, velocity.y),
    onCancel: () => engine.current?.drop(0, 0),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const map: Record<string, "left" | "right" | "up" | "down" | "home"> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      Home: "home",
    };
    const k = map[event.key];
    if (!k) return;
    event.preventDefault();
    engine.current?.key(k);
  };

  const tilt = Math.round(clamp(ringTilt, -40, 60));
  const name = ring
    ? tilt === 0
      ? `${label}, its ring edge-on.`
      : `${label}, its ring open ${Math.abs(tilt)} degrees.`
    : `${label}.`;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="planet"
      aria-label={name}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      {...(interactive ? drag : {})}
      className={cn(
        "group/banded-giant relative isolate h-56 w-full overflow-clip rounded-3 outline-none select-none",
        interactive && "cursor-grab touch-none active:cursor-grabbing",
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
        className="pointer-events-none absolute inset-0 flex items-center-safe justify-center-safe overflow-clip group-data-live/banded-giant:hidden"
      >
        <pre
          className="font-mono text-[7px] leading-[8px]"
          style={{
            color: `color-mix(in oklab, ${palette.zone} 70%, transparent)`,
          }}
        >
          {stand.join("\n")}
        </pre>
      </div>
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
      {interactive ? (
        <span id={hintId} className="sr-only">
          Drag or use the arrow keys: left and right spin it, up and down tip
          it, Home stops the spin.
        </span>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
