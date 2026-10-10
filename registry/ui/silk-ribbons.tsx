"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SilkRibbonsPalette = "opal" | "ember" | "tide" | "mono";

export type SilkRibbonsProps = {
  /** Content laid over the ribbons, such as a headline. It keeps every click, focus and key. */
  children?: React.ReactNode;
  /** How many ribbons stream from the pointer, 1 to 8. @default 5 */
  count?: number;
  /** A ribbon's length in px; each varies around it by `variance`, and none outgrows 1.6× the box's shorter side. @default 220 */
  length?: number;
  /** The silk: a named palette, or your own CSS colours the ribbons shift through along their length. @default "opal" */
  colors?: SilkRibbonsPalette | readonly string[];
  /** A ribbon's widest, just below the head, in px. @default 11 */
  width?: number;
  /** How much a ribbon thins toward its tail, 0 (even) to 1 (a fine point). @default 0.85 */
  taper?: number;
  /** How tightly the heads follow and the links hold, 0 (springs.drift, loose) to 1 (springs.snap, taut). @default 0.5 */
  stiffness?: number;
  /** How different the ribbons are from each other in length and stiffness, 0 to 1. @default 0.5 */
  variance?: number;
  /** How much the ribbons wind into loops as they catch up, 0 to 1. @default 0.5 */
  curl?: number;
  /** Twists along each ribbon; where it turns edge-on it narrows and darkens. @default 1.5 */
  twist?: number;
  /** A soft specular streak down faces turned to the light, 0 to 1. @default 0.6 */
  sheen?: number;
  /** How wide the fan of heads is either side of the pointer, across its direction of travel, in px. @default 12 */
  spread?: number;
  /** A press whips the ribbons, throwing a loop down each one. @default true */
  whip?: boolean;
  /** With nobody pointing, the ribbons fly a slow figure-eight through the box. @default true */
  ambient?: boolean;
  /** Keyboard focus on a control inside sends the ribbons to circle it. @default true */
  followFocus?: boolean;
  /** Follow the pointer. @default true */
  interactive?: boolean;
  /** Hold the ribbons still and stop the frame loop. @default false */
  paused?: boolean;
  /** Seed for every ribbon's length, spring, twist and colour. @default 5 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a press (or Enter/Space on a control inside) whips the ribbons, with the point in the box. */
  onWhip?: (point: { x: number; y: number }) => void;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
};

const PALETTES: Record<SilkRibbonsPalette, readonly string[]> = {
  opal: [
    "oklch(from var(--accent-bright) 0.7 0.14 h)",
    "oklch(from var(--accent-bright) 0.74 0.13 320)",
    "oklch(from var(--signal) 0.84 0.1 h)",
  ],
  ember: [
    "oklch(from var(--danger) 0.64 0.18 h)",
    "oklch(from var(--warn) 0.82 0.13 h)",
    "oklch(from var(--danger) 0.74 0.13 350)",
  ],
  tide: [
    "oklch(from var(--accent-bright) 0.58 0.14 h)",
    "oklch(from var(--signal) 0.78 0.11 h)",
    "oklch(from var(--accent-bright) 0.84 0.07 220)",
  ],
  mono: ["var(--foreground)", "var(--ink-3)", "var(--ink-2)"],
};

/** Points per ribbon, head included. */
const PTS = 32;
const MAXR = 8;
/** Palette positions and edge-on shades in the colour lookup. */
const STOPS = 64;
const SHADES = 8;
const SHEENS = 8;
/** Downward pull on the slack silk, px/s². */
const GRAVITY = 36;
const TAU = Math.PI * 2;

type Lab = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hash = (i: number, seed: number) => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const toSrgb = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/** sRGB (0..1) to OKLab, so the silk blends through even, unmuddied hues. */
function toLab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromLab([L, a, b]: Lab): string {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const to255 = (c: number) => Math.round(clamp(toSrgb(c), 0, 1) * 255);
  return `rgb(${to255(r)} ${to255(g)} ${to255(bl)})`;
}

/**
 * Silk ribbons streaming from the pointer, drawn on one Canvas 2D layer
 * under the content. Each ribbon is a chain of 24 points: its head rides an
 * anchor turning slowly round the pointer on a spring blended between
 * springs.drift and springs.snap by `stiffness`, and every link is an
 * underdamped spring that pulls toward its rest length behind the link ahead,
 * with a curl that turns its swing sideways — so when the pointer stops, the
 * ribbons overshoot, wind into loops and unwind as they catch up. Ribbons
 * differ by `variance` in length, stiffness and damping, so a sweep fans them
 * out. Each one tapers from head to tail and twists along its length: edge-on
 * it narrows and darkens, and its two faces carry different places in the
 * palette, so the colour shifts like iridescent silk, with a soft streak of
 * sheen down faces turned to the light.
 *
 * With nobody pointing the ribbons fly a slow figure-eight; keyboard focus
 * on a control inside sends them to circle it, and a press (or Enter/Space on
 * a control) whips them. Under reduced motion they hang in one still,
 * settled sweep.
 */
export function SilkRibbons({
  children,
  count = 5,
  length = 220,
  colors = "opal",
  width = 11,
  taper = 0.85,
  stiffness = 0.5,
  variance = 0.5,
  curl = 0.5,
  twist = 1.5,
  sheen = 0.6,
  spread = 12,
  whip = true,
  ambient = true,
  followFocus = true,
  interactive = true,
  paused = false,
  seed = 5,
  dpr = 2,
  onWhip,
  className,
}: SilkRibbonsProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const api = React.useRef<{
    rebuild: () => void;
    refit: () => void;
    restyle: () => void;
    wake: () => void;
  } | null>(null);

  const palette: readonly string[] =
    typeof colors === "string"
      ? (PALETTES[colors as SilkRibbonsPalette] ?? PALETTES.opal)
      : colors.length > 0
        ? colors
        : PALETTES.opal;
  const paletteKey = palette.join("|");
  const ribbons = clamp(Math.round(count), 1, MAXR);

  const params = React.useRef({
    ribbons,
    length,
    width,
    taper,
    stiffness,
    variance,
    curl,
    twist,
    sheen,
    spread,
    whip,
    ambient,
    followFocus,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onWhip,
    palette,
  });
  React.useEffect(() => {
    params.current = {
      ribbons,
      length,
      width,
      taper,
      stiffness,
      variance,
      curl,
      twist,
      sheen,
      spread,
      whip,
      ambient,
      followFocus,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
      onWhip,
      palette,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d") ?? null;
    if (!root || !canvas || !g) return;

    // Every array the simulation and the drawing touch is made once.
    const N = MAXR * PTS;
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const ox = new Float32Array(N);
    const oy = new Float32Array(N);
    const headVX = new Float32Array(MAXR);
    const headVY = new Float32Array(MAXR);
    const seg = new Float32Array(MAXR);
    const headK = new Float32Array(MAXR);
    const headC = new Float32Array(MAXR);
    const bend = new Float32Array(MAXR);
    const drag = new Float32Array(MAXR);
    const hand = new Float32Array(MAXR);
    const phase = new Float32Array(MAXR);
    const theta = new Float32Array(MAXR);
    const depth = new Float32Array(MAXR);
    const hue = new Float32Array(MAXR);
    const order = new Int8Array(MAXR);
    const lx = new Float32Array(PTS);
    const ly = new Float32Array(PTS);
    const rx = new Float32Array(PTS);
    const ry = new Float32Array(PTS);
    const face = new Float32Array(PTS);
    const lastX = new Float32Array(N);
    const lastY = new Float32Array(N);
    let lut: string[] = [];
    let sheens: string[] = [];
    let count = 0;
    let w = 0;
    let h = 0;
    let ratio = 1;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let clock = 0;
    let energy = 0;
    let calm = 0;
    let inView = true;
    let built = false;
    const anchor = { x: 0, y: 0 };
    const heading = { x: 1, y: 0 };
    // Set while the still is being flown, whatever `ambient` says.
    let flying = false;
    const pointer = { x: 0, y: 0, inside: false, down: false, until: 0 };
    let ring: { cx: number; cy: number; rx: number; ry: number } | null = null;

    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const sample = (css: string): Lab => {
      const probe = probeRef.current;
      if (!probe || !reader) return [0.6, 0, 0];
      probe.style.color = css;
      reader.clearRect(0, 0, 1, 1);
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = getComputedStyle(probe).color;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return toLab(
        (d[0] ?? 128) / 255,
        (d[1] ?? 128) / 255,
        (d[2] ?? 128) / 255,
      );
    };

    /** The colour lookup: palette position × edge-on shade, built once per palette. */
    const restyle = () => {
      const stops = params.current.palette.map(sample);
      const n = Math.max(1, stops.length);
      const next: string[] = [];
      for (let k = 0; k < STOPS; k += 1) {
        // Cyclic, so a ribbon's two faces can sit anywhere on the palette.
        const u = (k / STOPS) * n;
        const i0 = Math.floor(u) % n;
        const i1 = (i0 + 1) % n;
        const f = u - Math.floor(u);
        const e = f * f * (3 - 2 * f);
        const a = stops[i0] ?? [0.6, 0, 0];
        const b = stops[i1] ?? a;
        for (let s = 0; s < SHADES; s += 1) {
          // Edge-on silk is in its own shadow: darker, a touch richer.
          const dim = (1 - s / (SHADES - 1)) * 0.3;
          next.push(
            fromLab([
              lerp(a[0], b[0], e) * (1 - dim),
              lerp(a[1], b[1], e) * (1 + dim * 0.4),
              lerp(a[2], b[2], e) * (1 + dim * 0.4),
            ]),
          );
        }
      }
      lut = next;
      sheens = Array.from(
        { length: SHEENS },
        (_, k) => `rgb(255 255 255 / ${((k + 1) / SHEENS) * 0.5})`,
      );
    };

    const ambientAt = (t: number, out: { x: number; y: number }) => {
      const swirl = hash(41, params.current.seed) * TAU;
      out.x = w * (0.5 + 0.3 * Math.sin(t * 0.55 + swirl));
      out.y = h * (0.48 + 0.22 * Math.sin(t * 1.1 + swirl * 2));
    };
    const goal = { x: 0, y: 0 };
    const aim = () => {
      const p = params.current;
      if (p.interactive && pointer.inside) {
        goal.x = pointer.x;
        goal.y = pointer.y;
      } else if (p.followFocus && ring) {
        // Round the focused control, so the silk wraps it.
        goal.x = ring.cx + ring.rx * Math.cos(clock * 1.6);
        goal.y = ring.cy + ring.ry * Math.sin(clock * 1.6);
      } else if (p.ambient || flying) {
        ambientAt(clock, goal);
      } else {
        goal.x = anchor.x;
        goal.y = anchor.y;
      }
      // The heading the hand travels, smoothed, so the fan of heads turns
      // with the motion and holds its last heading when the hand stops.
      const mx = goal.x - anchor.x;
      const my = goal.y - anchor.y;
      const md = Math.sqrt(mx * mx + my * my);
      if (md > 0.01) {
        heading.x += (mx / md - heading.x) * Math.min(1, md * 0.08);
        heading.y += (my / md - heading.y) * Math.min(1, md * 0.08);
        const hd = Math.sqrt(heading.x * heading.x + heading.y * heading.y);
        if (hd > 1e-3) {
          heading.x /= hd;
          heading.y /= hd;
        }
      }
      anchor.x = goal.x;
      anchor.y = goal.y;
    };

    /** A fresh set of ribbons, laid out behind the anchor. */
    const build = () => {
      const p = params.current;
      count = p.ribbons;
      const shorter = Math.max(40, Math.min(w, h));
      const v = clamp(p.variance, 0, 1);
      const stiff = clamp(p.stiffness, 0, 1);
      // Per unit mass, so the blend is between the springs' own responses.
      const snapK = springs.snap.stiffness / springs.snap.mass;
      const snapC = springs.snap.damping / springs.snap.mass;
      const driftK = springs.drift.stiffness / springs.drift.mass;
      const driftC = springs.drift.damping / springs.drift.mass;
      for (let r = 0; r < MAXR; r += 1) {
        const total = Math.min(
          Math.max(40, p.length) * (1 + v * (hash(r * 9, p.seed) - 0.5) * 0.8),
          shorter * 1.6,
        );
        seg[r] = total / (PTS - 1);
        const s = clamp(
          stiff + v * (hash(r * 9 + 1, p.seed) - 0.5) * 0.8,
          0,
          1,
        );
        headK[r] = lerp(driftK, snapK, s);
        headC[r] = lerp(driftC, snapC, s);
        // Taut silk holds its line; loose silk folds and trails.
        bend[r] = lerp(0.05, 0.24, s);
        drag[r] = lerp(2.4, 1, hash(r * 9 + 2, p.seed));
        hand[r] = r % 2 === 0 ? 1 : -1;
        phase[r] = hash(r * 9 + 3, p.seed) * TAU;
        // Where across the fan this ribbon is tied, -1 to 1.
        theta[r] = hash(r * 9 + 4, p.seed) * 0.5 - 0.25;
        depth[r] = 0.68 + 0.32 * hash(r * 9 + 5, p.seed);
        hue[r] = hash(r * 9 + 6, p.seed);
      }
      // Back to front, so nearer ribbons cross over farther ones.
      const idx = Array.from({ length: count }, (_, r) => r).sort(
        (a, b) => (depth[a] ?? 0) - (depth[b] ?? 0),
      );
      idx.forEach((r, i) => {
        order[i] = r;
      });
      aim();
      for (let r = 0; r < count; r += 1) {
        for (let i = 0; i < PTS; i += 1) {
          const k = r * PTS + i;
          px[k] = anchor.x - i * (seg[r] ?? 4) * 0.98;
          py[k] = anchor.y + i * 0.6;
          ox[k] = px[k] ?? 0;
          oy[k] = py[k] ?? 0;
        }
        headVX[r] = 0;
        headVY[r] = 0;
      }
      built = true;
    };

    const step = (dt: number) => {
      const p = params.current;
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const hs = dt / steps;
      const hs2 = hs * hs;
      const curlRate = clamp(p.curl, 0, 1) * 1.4;
      const led =
        p.ambient ||
        flying ||
        (p.interactive && pointer.inside) ||
        ring !== null;
      const fall = led ? GRAVITY : 0;
      const reach = Math.max(0, p.spread);
      for (let s = 0; s < steps; s += 1) {
        clock += hs;
        aim();
        for (let r = 0; r < count; r += 1) {
          const base = r * PTS;
          // The head rides its anchor on a house spring.
          // Heads tied side by side across the direction of travel, like
          // streamers gathered in one hand.
          const across =
            (count > 1 ? (r / (count - 1)) * 2 - 1 : 0) + (theta[r] ?? 0);
          const tx = goal.x - heading.y * reach * across;
          const ty = goal.y + heading.x * reach * across;
          const hk = headK[r] ?? 300;
          const hc = headC[r] ?? 30;
          const hx = px[base] ?? 0;
          const hy = py[base] ?? 0;
          let hvx = headVX[r] ?? 0;
          let hvy = headVY[r] ?? 0;
          hvx += (hk * (tx - hx) - hc * hvx) * hs;
          hvy += (hk * (ty - hy) - hc * hvy) * hs;
          headVX[r] = hvx;
          headVY[r] = hvy;
          ox[base] = hx;
          oy[base] = hy;
          px[base] = hx + hvx * hs;
          py[base] = hy + hvy * hs;
          const L = seg[r] ?? 4;
          // Once nothing leads it the silk floats to a stop in still air
          // (heavier drag, no fall), so it settles where it is and the loop
          // can end.
          const keep = Math.exp(-((drag[r] ?? 1.6) + (led ? 0 : 8)) * hs);
          const side = hand[r] ?? 1;
          const b = bend[r] ?? 0.08;
          // Each link carries its own motion on, and gravity takes up the
          // slack. The curl: when a link catches up — moving toward the link
          // ahead faster than that one moves on — the overtaking motion is
          // turned sideways, so the silk winds into loops as it arrives and
          // streams smooth while it is being led.
          for (let i = 1; i < PTS; i += 1) {
            const k = base + i;
            const j = k - 1;
            const t = i / (PTS - 1);
            const x = px[k] ?? 0;
            const y = py[k] ?? 0;
            let dx = (x - (ox[k] ?? 0)) * keep;
            let dy = (y - (oy[k] ?? 0)) * keep;
            const ux = x - (px[j] ?? 0);
            const uy = y - (py[j] ?? 0);
            const ud = Math.sqrt(ux * ux + uy * uy) || 1e-6;
            const relX = dx - ((px[j] ?? 0) - (ox[j] ?? 0));
            const relY = dy - ((py[j] ?? 0) - (oy[j] ?? 0));
            const closing = -(relX * ux + relY * uy) / ud;
            if (closing > 0) {
              // Redirected, never added: a share of the closing motion is
              // taken away and given back sideways, so the curl can only
              // spend energy, and still silk comes to rest.
              const q = Math.min(0.9, curlRate * t) * closing;
              dx += (ux / ud) * q - (uy / ud) * q * side;
              dy += (uy / ud) * q + (ux / ud) * q * side;
            }
            ox[k] = x;
            oy[k] = y;
            px[k] = x + dx;
            py[k] = y + dy + fall * (0.3 + 0.7 * t) * hs2;
          }
          // Smooth toward the neighbours' midpoint (the bend: it irons out
          // exactly the fine fold a rope would otherwise zigzag into), then
          // put every link back at its length behind the one ahead (follow
          // the leader).
          for (let i = 1; i < PTS - 1; i += 1) {
            const k = base + i;
            const mx = ((px[k - 1] ?? 0) + (px[k + 1] ?? 0)) / 2;
            const my = ((py[k - 1] ?? 0) + (py[k + 1] ?? 0)) / 2;
            px[k] = (px[k] ?? 0) + (mx - (px[k] ?? 0)) * b;
            py[k] = (py[k] ?? 0) + (my - (py[k] ?? 0)) * b;
          }
          for (let i = 1; i < PTS; i += 1) {
            const k = base + i;
            const j = k - 1;
            const x = px[k] ?? 0;
            const y = py[k] ?? 0;
            const dx = x - (px[j] ?? 0);
            const dy = y - (py[j] ?? 0);
            const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
            px[k] = (px[j] ?? 0) + (dx / d) * L;
            py[k] = (py[j] ?? 0) + (dy / d) * L;
          }
        }
      }
      // True motion over the whole step, in px per second: how far any
      // point actually travelled, not what the solver shuffled inside it.
      let moved = 0;
      for (let k = 0; k < count * PTS; k += 1) {
        moved = Math.max(
          moved,
          Math.abs((px[k] ?? 0) - (lastX[k] ?? 0)) +
            Math.abs((py[k] ?? 0) - (lastY[k] ?? 0)),
        );
        lastX[k] = px[k] ?? 0;
        lastY[k] = py[k] ?? 0;
      }
      energy = dt > 0 ? moved / dt : 0;
    };

    const draw = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (w < 1 || h < 1 || lut.length === 0) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const p = params.current;
      const wide = Math.max(1, p.width);
      const thin = clamp(p.taper, 0, 1);
      const turns = Math.max(0, p.twist) * TAU;
      const gloss = clamp(p.sheen, 0, 1);
      g.lineJoin = "round";
      g.lineWidth = 0.75;
      for (let o = 0; o < count; o += 1) {
        const r = order[o] ?? 0;
        const base = r * PTS;
        const spin = clock * 0.8 * (hand[r] ?? 1);
        for (let i = 0; i < PTS; i += 1) {
          const k = base + i;
          const a = i > 0 ? k - 1 : k;
          const b = i < PTS - 1 ? k + 1 : k;
          let tx = (px[b] ?? 0) - (px[a] ?? 0);
          let ty = (py[b] ?? 0) - (py[a] ?? 0);
          const d = Math.sqrt(tx * tx + ty * ty) || 1;
          tx /= d;
          ty /= d;
          const t = i / (PTS - 1);
          // Slim where it is tied on, full a little way down, then tapering.
          const tie = 0.35 + 0.65 * Math.min(1, t / 0.12);
          const half =
            wide *
            (depth[r] ?? 1) *
            0.5 *
            tie *
            Math.max(0.06, 1 - thin * Math.pow(t, 0.9));
          const f = Math.cos((phase[r] ?? 0) + t * turns + spin);
          face[i] = f;
          const vw = half * (0.18 + 0.82 * Math.abs(f));
          const cx = px[k] ?? 0;
          const cy = py[k] ?? 0;
          lx[i] = cx - ty * vw;
          ly[i] = cy + tx * vw;
          rx[i] = cx + ty * vw;
          ry[i] = cy - tx * vw;
        }
        // Tail first, so the head lies over its own silk.
        for (let i = PTS - 2; i >= 0; i -= 1) {
          // The quad takes the mean of its two ends, so a twist shades
          // through edge-on instead of flipping.
          const f = ((face[i] ?? 1) + (face[i + 1] ?? 1)) / 2;
          const t = (i + 0.5) / (PTS - 1);
          // The two faces sit a third of the palette apart: iridescence.
          const at = ((hue[r] ?? 0) + t * 0.8 + (f < 0 ? 0.33 : 0)) % 1;
          const shade = Math.round(Math.abs(f) * (SHADES - 1));
          const style =
            lut[Math.floor(at * STOPS) * SHADES + shade] ?? lut[0] ?? "gray";
          g.fillStyle = style;
          g.strokeStyle = style;
          g.beginPath();
          g.moveTo(lx[i] ?? 0, ly[i] ?? 0);
          g.lineTo(lx[i + 1] ?? 0, ly[i + 1] ?? 0);
          g.lineTo(rx[i + 1] ?? 0, ry[i + 1] ?? 0);
          g.lineTo(rx[i] ?? 0, ry[i] ?? 0);
          g.closePath();
          g.fill();
          g.stroke();
          const lit = Math.abs(f);
          if (gloss > 0 && lit > 0.55) {
            const level = Math.pow((lit - 0.55) / 0.45, 2) * gloss;
            const q = Math.min(SHEENS - 1, Math.round(level * (SHEENS - 1)));
            if (q > 0) {
              // A narrower streak down the middle of the face.
              const m0x = ((lx[i] ?? 0) + (rx[i] ?? 0)) / 2;
              const m0y = ((ly[i] ?? 0) + (ry[i] ?? 0)) / 2;
              const m1x = ((lx[i + 1] ?? 0) + (rx[i + 1] ?? 0)) / 2;
              const m1y = ((ly[i + 1] ?? 0) + (ry[i + 1] ?? 0)) / 2;
              g.fillStyle = sheens[q] ?? "transparent";
              g.beginPath();
              g.moveTo(
                m0x + ((lx[i] ?? 0) - m0x) * 0.4,
                m0y + ((ly[i] ?? 0) - m0y) * 0.4,
              );
              g.lineTo(
                m1x + ((lx[i + 1] ?? 0) - m1x) * 0.4,
                m1y + ((ly[i + 1] ?? 0) - m1y) * 0.4,
              );
              g.lineTo(
                m1x + ((rx[i + 1] ?? 0) - m1x) * 0.4,
                m1y + ((ry[i + 1] ?? 0) - m1y) * 0.4,
              );
              g.lineTo(
                m0x + ((rx[i] ?? 0) - m0x) * 0.4,
                m0y + ((ry[i] ?? 0) - m0y) * 0.4,
              );
              g.closePath();
              g.fill();
            }
          }
        }
      }
    };

    /** Reduced motion and the first frame: a deterministic flight, then frozen. */
    const settle = (seconds: number) => {
      const keep = pointer.inside;
      const keepRing = ring;
      pointer.inside = false;
      ring = null;
      flying = true;
      // Fly on to the next time the flight crosses the middle of the box,
      // where it is fastest and the silk streams out behind it, so the
      // first frame (and the reduced-motion still) is a sweep, not a knot.
      const swirl = hash(41, params.current.seed) * TAU;
      const crossing =
        (Math.PI * Math.ceil((0.55 * (clock + seconds) + swirl) / Math.PI) -
          swirl) /
          0.55 -
        clock;
      let t = 0;
      while (t < crossing) {
        step(1 / 60);
        t += 1 / 60;
      }
      flying = false;
      pointer.inside = keep;
      ring = keepRing;
    };

    const canRun = () => {
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe) return false;
      if (w < 1 || !built) return false;
      if (p.ambient || (p.interactive && pointer.inside) || ring !== null) {
        return true;
      }
      // Nothing leads the silk: once it has drifted slower than a third of
      // a pixel a frame for a quarter second, it has settled.
      return calm < 30;
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      carry += dt;
      if (pointer.until && now > pointer.until) {
        pointer.until = 0;
        if (!pointer.down) pointer.inside = false;
      }
      // With only the flight to draw, every other frame is plenty.
      const lively =
        (params.current.interactive && pointer.inside) ||
        ring !== null ||
        energy > 400;
      if (lively || carry >= 1 / 30) {
        step(carry);
        carry = 0;
        draw();
        calm = energy < 24 ? calm + 1 : 0;
      }
      if (canRun()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!params.current.motionSafe) {
        draw();
        return;
      }
      // Anything that wakes the silk has given it somewhere to go.
      calm = 0;
      if (raf) return;
      if (!canRun()) {
        draw();
        return;
      }
      last = performance.now();
      carry = 0;
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const rebuild = () => {
      if (w < 1 || h < 1) return;
      clock = 0;
      build();
      settle(params.current.motionSafe ? 2.4 : 3.2);
      draw();
      wake();
    };

    /** The backing store: the box's size at the capped pixel ratio. */
    const fit = (nw: number, nh: number) => {
      ratio = Math.min(
        2,
        Math.max(0.5, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.max(1, Math.round(nw * ratio));
      canvas.height = Math.max(1, Math.round(nh * ratio));
    };

    const resize = () => {
      const nw = root.clientWidth;
      const nh = root.clientHeight;
      if (nw < 1 || nh < 1) return;
      const p = params.current;
      fit(nw, nh);
      const first = !built || w < 1;
      w = nw;
      h = nh;
      if (first || !p.motionSafe) rebuild();
      else {
        draw();
        wake();
      }
    };

    const local = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    const lash = (x: number, y: number) => {
      const p = params.current;
      if (!p.whip || !p.motionSafe) return;
      const amp = 520 + 480 * clamp(p.curl, 0, 1);
      for (let r = 0; r < count; r += 1) {
        const base = r * PTS;
        const sign = (hand[r] ?? 1) * (0.6 + 0.4 * hash(r * 9 + 7, p.seed));
        for (let i = 1; i < PTS; i += 1) {
          const k = base + i;
          const a = k - 1;
          const b = i < PTS - 1 ? k + 1 : k;
          const tx = (px[b] ?? 0) - (px[a] ?? 0);
          const ty = (py[b] ?? 0) - (py[a] ?? 0);
          const d = Math.sqrt(tx * tx + ty * ty) || 1;
          const t = i / (PTS - 1);
          // An S down the chain: one loop thrown out, the tail answering.
          // Verlet keeps velocity as the step from the last position, so
          // the kick moves the last position back.
          const kick = amp * Math.sin(TAU * t) * sign * (1 / 120);
          ox[k] = (ox[k] ?? 0) + (ty / d) * kick;
          oy[k] = (oy[k] ?? 0) - (tx / d) * kick;
        }
      }
      energy = Math.max(energy, amp);
      p.onWhip?.({ x: Math.round(x), y: Math.round(y) });
      wake();
    };

    const onMove = (event: PointerEvent) => {
      if (!params.current.interactive) return;
      if (event.pointerType === "touch" && !pointer.down) return;
      const pt = local(event.clientX, event.clientY);
      pointer.x = pt.x;
      pointer.y = pt.y;
      pointer.inside = true;
      wake();
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.inside = false;
      wake();
    };
    const onDown = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const pt = local(event.clientX, event.clientY);
      pointer.x = pt.x;
      pointer.y = pt.y;
      pointer.inside = true;
      if (event.pointerType === "touch") {
        // A finger has no hover: the ribbons swoop to the tap, follow a
        // sideways drag, and return to their flight a moment after.
        pointer.down = true;
        pointer.until = 0;
      }
      lash(pt.x, pt.y);
      wake();
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointer.down = false;
      pointer.until = performance.now() + 1200;
      wake();
    };
    // Enter or Space on a control inside: a click with no pointer behind it.
    const onClick = (event: MouseEvent) => {
      if (event.detail !== 0) return;
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      const r = el.getBoundingClientRect();
      const pt = local(r.left + r.width / 2, r.top + r.height / 2);
      lash(pt.x, pt.y);
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!el.matches(":focus-visible") || !params.current.followFocus) return;
      const r = el.getBoundingClientRect();
      const c = local(r.left + r.width / 2, r.top + r.height / 2);
      ring = {
        cx: c.x,
        cy: c.y,
        rx: r.width / 2 + 14,
        ry: r.height / 2 + 12,
      };
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      ring = null;
      wake();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointercancel", onUp);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(resize);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    restyle();
    api.current = {
      rebuild,
      refit: () => {
        if (w < 1 || h < 1) return;
        fit(w, h);
        draw();
      },
      restyle: () => {
        restyle();
        draw();
      },
      wake: () => {
        const p = params.current;
        if (!p.interactive) pointer.inside = false;
        if (!p.followFocus) ring = null;
        if (!p.motionSafe) {
          rebuild();
          return;
        }
        draw();
        wake();
      },
    };

    return () => {
      halt();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onUp);
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      api.current = null;
    };
  }, []);

  React.useEffect(() => {
    api.current?.rebuild();
  }, [ribbons, length, variance, stiffness, seed]);
  React.useEffect(() => {
    api.current?.refit();
  }, [dpr]);
  React.useEffect(() => {
    api.current?.restyle();
  }, [paletteKey]);
  React.useEffect(() => {
    api.current?.wake();
  }, [
    width,
    taper,
    curl,
    twist,
    sheen,
    spread,
    whip,
    ambient,
    followFocus,
    interactive,
    paused,
    motionSafe,
  ]);

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate touch-pan-y overflow-clip", className)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 size-full"
      />
      <div className="relative z-10 size-full">{children}</div>
      {/* Colours are resolved on this probe, inside the component, so a
          themed wrapper's tokens are the ones read. */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.restyle()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
