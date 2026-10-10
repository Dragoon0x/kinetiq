"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DewWebProps = {
  /** The content above the web: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How finely the web is spun, 0 to 1: more radials and more turns of the spiral. @default 0.55 */
  density?: number;
  /** How far the capture threads droop between radials under their own weight, 0 to 1. @default 0.4 */
  sag?: number;
  /** How brightly the dew and the silk catch the moving light, 0 to 1. @default 0.6 */
  glint?: number;
  /** How much dew has gathered on the silk, 0 to 1. @default 0.55 */
  dew?: number;
  /** Where the web's centre sits, as fractions of the box's width and height. @default [0.68, 0.42] */
  hub?: readonly [number, number];
  /** The silk's colour, as a CSS colour. @default the foreground mixed into the page */
  silk?: string;
  /** The colour of the glints, as a CSS colour. @default a cool white */
  glintColor?: string;
  /** The morning air behind the web, as a CSS colour. @default the page with a breath of green */
  mist?: string;
  /** How long the web keeps trembling once disturbed, 0 (it stills at once) to 1 (it rings). @default 0.5 */
  ring?: number;
  /** How fast the light travels round and the anchors sway, 0 to 2. @default 1 */
  speed?: number;
  /** The hand brushes the silk and a press plucks it. @default true */
  interactive?: boolean;
  /** How hard the hand brushes and plucks, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Picks the web: the same seed spins the same web with the same dew. @default 1 */
  seed?: number;
  /** Holds the sway and the light still; the hand still disturbs the silk. @default false */
  paused?: boolean;
  /** Spin the capture spiral onto the web, then bead the dew, the first time it is seen. @default true */
  intro?: boolean;
  /** The highest device pixel ratio the web is drawn at, never above 2. @default 2 */
  dpr?: number;
  /** Fires when the web is plucked: by a press, or by keyboard focus arriving inside it. */
  onPluck?: () => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
  /** Classes for the content layer above the web. */
  contentClassName?: string;
};

const DEFAULT_SILK =
  "color-mix(in oklab, var(--foreground) 62%, var(--background))";
const DEFAULT_GLINT = "color-mix(in oklab, white 92%, var(--accent-bright))";
const DEFAULT_MIST =
  "color-mix(in oklab, var(--background) 74%, oklch(0.5 0.05 175))";

/** Fixed physics step: the silk is integrated at 240 Hz whatever the display does. */
const STEP = 1 / 240;
/** Each node's pull back to its place, and the tension along the silk. */
const HOLD = 40;
const TENSION = 500;
/** A frame and its moorings: this many corners round the web. */
const CORNERS = 7;
/** How far round the hub the free zone reaches, and where the spiral ends. */
const FREE = 0.2;
const REACH = 0.93;
const BRUSH = 50;
const MAX_PULL = 18;
/** Out-of-focus drops far behind the web: x %, y %, radius px. */
const BOKEH = [
  [12, 22, 9],
  [31, 70, 14],
  [52, 18, 7],
  [78, 78, 11],
  [90, 30, 16],
  [63, 52, 6],
] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The props a background leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Rgba = readonly [number, number, number, number];

/** A small seeded generator: the same web every time. */
function seeded(seed: number) {
  let s = Math.imul(seed | 0, 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as sRGB bytes and alpha, by painting one pixel. */
function rgbaReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgba => {
    if (!ctx) return [0, 0, 0, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 255) / 255];
  };
}

const rgba = (c: Rgba, alpha = 1) =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.round(c[3] * alpha * 1000) / 1000})`;

type Web = {
  w: number;
  h: number;
  dpr: number;
  /** Radials and turns of the spiral; nodes are indexed k * radials + j. */
  radials: number;
  turns: number;
  hubX: number;
  hubY: number;
  /** The frame's corners at rest, the moorings' far ends, and each corner's sway. */
  corners: Float32Array;
  anchors: Float32Array;
  sway: Float32Array;
  /** Where each radial meets the frame: the edge it lands on and how far along it. */
  edge: Uint8Array;
  along: Float32Array;
  /** Each node's place along its radial, 0 at the hub, 1 at the frame. */
  frac: Float32Array;
  /** Displacement and velocity of every node, and of the hub. */
  ux: Float32Array;
  uy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  hub: { ux: number; uy: number; vx: number; vy: number };
  /** Where everything is drawn this frame. */
  px: Float32Array;
  py: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  /** The hub's little mesh: three rings of fractions per radial. */
  mesh: Float32Array;
  /** Dew: the spiral segment each drop hangs on, where along it, its size and facet. */
  dropSeg: Uint16Array;
  dropT: Float32Array;
  dropR: Float32Array;
  dropFacet: Float32Array;
  /** Brightness a press lends nearby dew under reduced motion. */
  dropFlash: Float32Array;
  /** Glints to draw this frame: x, y, radius, brightness. */
  stars: Float32Array;
  drops: number;
  /** The web's reach in px, for brushing and plucking. */
  reach: number;
};

type Look = {
  silk: Rgba;
  glint: Rgba;
  page: Rgba;
  dark: boolean;
  bead: HTMLCanvasElement;
  star: HTMLCanvasElement;
};

type Api = {
  refresh: (rebuild: boolean) => void;
  recolor: () => void;
  local: (clientX: number, clientY: number) => { x: number; y: number };
  brush: (x: number, y: number, at: number) => void;
  lift: () => void;
  pluck: (x: number, y: number, strength: number) => void;
};

/**
 * A background of an orb-weaver's web at first light: radials from a hub to
 * a frame held by mooring threads that run out of the box, a capture spiral
 * that droops between the radials under its own weight, and dew beaded on
 * the silk, gathered toward each thread's low point. A light travels slowly
 * round the scene: droplets whose facets face it flash, the brightest
 * throwing a small star, and silk lying across it carries a sheen, so two
 * bright arcs sweep round the web as the light moves. The anchors sway a few
 * pixels, so the whole web breathes.
 *
 * Every crossing of spiral and radial is a mass on springs, held to its place
 * and tied to its neighbours along the silk, so a disturbance travels: the
 * hand brushes the nodes it passes and the web trembles, the dew flashing as
 * it swings through the light; a press plucks the nearest thread and the web
 * rings with a few visible swings — under-damped near the recoil spring's
 * ratio, set by `ring` — and settles. The first time it is seen the capture
 * spiral is spun onto the standing scaffold, ring by ring from the hub, and
 * the dew beads in. Keyboard focus arriving on content inside it gives
 * the web a gentle pluck beside the focused element.
 *
 * Canvas 2D over a CSS mist; the loop runs only while on screen and in a
 * visible page — at full rate while the silk trembles, at half rate for the
 * slow sway and light, not at all when paused and still. Under reduced
 * motion the web is a still frame with the light fixed; a press brightens
 * the dew near the hand for a moment instead of shaking it.
 */
export function DewWeb({
  children,
  density = 0.55,
  sag = 0.4,
  glint = 0.6,
  dew = 0.55,
  hub = [0.68, 0.42],
  silk = DEFAULT_SILK,
  glintColor = DEFAULT_GLINT,
  mist = DEFAULT_MIST,
  ring = 0.5,
  speed = 1,
  interactive = true,
  pointerStrength = 0.6,
  seed = 1,
  paused = false,
  intro = true,
  dpr = 2,
  onPluck,
  className,
  contentClassName,
}: DewWebProps) {
  const motionSafe = useMotionSafe();
  const hubX = clamp(hub[0], 0, 1);
  const hubY = clamp(hub[1], 0, 1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const silkRef = React.useRef<HTMLSpanElement | null>(null);
  const glintRef = React.useRef<HTMLSpanElement | null>(null);
  const pageRef = React.useRef<HTMLSpanElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const latest = React.useRef({
    density,
    sag,
    glint,
    dew,
    hubX,
    hubY,
    ring,
    speed,
    interactive,
    pointerStrength,
    seed,
    paused,
    intro,
    dpr,
    motionSafe,
    onPluck,
  });
  React.useEffect(() => {
    latest.current = {
      density,
      sag,
      glint,
      dew,
      hubX,
      hubY,
      ring,
      speed,
      interactive,
      pointerStrength,
      seed,
      paused,
      intro,
      dpr,
      motionSafe,
      onPluck,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!root || !canvas || !ctx) return;

    let web: Web | null = null;
    let look: Look | null = null;
    let raf = 0;
    let last = 0;
    let drawnAt = 0;
    let visible = true;
    let dirty = true;
    let disposed = false;
    let trembling = false;
    const L0 = latest.current;
    // Each seed starts the light somewhere else; a still frame is always
    // this same moment.
    let time = ((Math.abs(L0.seed) * 0.6180339) % 1) * 20 + 3;
    let introState: "waiting" | "running" | "done" = "waiting";
    let introClock = 0;
    const hand = { x: 0, y: 0, vx: 0, vy: 0, at: 0, present: false };
    const read = rgbaReader();

    const sprite = (
      size: number,
      paint: (c: CanvasRenderingContext2D, s: number) => void,
    ) => {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const g = c.getContext("2d");
      if (g) paint(g, size);
      return c;
    };

    const recolor = () => {
      const silkC = silkRef.current
        ? read(getComputedStyle(silkRef.current).color)
        : ([128, 128, 128, 1] as const);
      const glintC = glintRef.current
        ? read(getComputedStyle(glintRef.current).color)
        : ([255, 255, 255, 1] as const);
      const pageC = pageRef.current
        ? read(getComputedStyle(pageRef.current).color)
        : ([0, 0, 0, 1] as const);
      const luma =
        (0.2126 * pageC[0] + 0.7152 * pageC[1] + 0.0722 * pageC[2]) / 255;
      const dark = luma < 0.5;
      // A drop of dew is a lens: a rim darker than the silk, a body that
      // shows the light behind it, and a highlight up and to the left.
      const bead = sprite(32, (g, s) => {
        const r = s / 2;
        const body = g.createRadialGradient(
          r * 0.85,
          r * 0.8,
          r * 0.1,
          r,
          r,
          r,
        );
        body.addColorStop(0, rgba(glintC, dark ? 0.55 : 0.95));
        body.addColorStop(0.55, rgba(pageC, dark ? 0.35 : 0.6));
        body.addColorStop(0.86, rgba(silkC, dark ? 0.75 : 0.9));
        body.addColorStop(1, rgba(silkC, 0));
        g.fillStyle = body;
        g.beginPath();
        g.arc(r, r, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rgba(glintC, 0.95);
        g.beginPath();
        g.arc(r * 0.7, r * 0.66, r * 0.17, 0, Math.PI * 2);
        g.fill();
      });
      const star = sprite(64, (g, s) => {
        const r = s / 2;
        const spike = (
          dx: number,
          dy: number,
          c: Rgba,
          a: number,
          wide: number,
        ) => {
          const line = g.createLinearGradient(
            r - dx * r,
            r - dy * r,
            r + dx * r,
            r + dy * r,
          );
          line.addColorStop(0, rgba(c, 0));
          line.addColorStop(0.5, rgba(c, a));
          line.addColorStop(1, rgba(c, 0));
          g.strokeStyle = line;
          g.lineWidth = s * wide;
          g.beginPath();
          g.moveTo(r - dx * r, r - dy * r);
          g.lineTo(r + dx * r, r + dy * r);
          g.stroke();
        };
        // On pale air light cannot show by itself: a soft shadow of silk
        // round the star gives it something to shine against.
        if (!dark) {
          const shadow = g.createRadialGradient(r, r, r * 0.08, r, r, r * 0.5);
          shadow.addColorStop(0, rgba(silkC, 0.5));
          shadow.addColorStop(1, rgba(silkC, 0));
          g.fillStyle = shadow;
          g.fillRect(0, 0, s, s);
          spike(1, 0, silkC, 0.45, 0.07);
          spike(0, 1, silkC, 0.45, 0.07);
        }
        const halo = g.createRadialGradient(r, r, 0, r, r, r * 0.45);
        halo.addColorStop(0, rgba(glintC, 1));
        halo.addColorStop(0.25, rgba(glintC, dark ? 0.55 : 0.8));
        halo.addColorStop(1, rgba(glintC, 0));
        g.fillStyle = halo;
        g.fillRect(0, 0, s, s);
        spike(1, 0, glintC, 0.9, 0.025);
        spike(0, 1, glintC, 0.9, 0.025);
      });
      look = { silk: silkC, glint: glintC, page: pageC, dark, bead, star };
    };

    /** Spins the web for the current size, seed and density. */
    const build = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      const L = latest.current;
      const scale = Math.min(
        2,
        Math.max(0.5, L.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const rand = seeded(Math.abs(L.seed) * 7919 + 17);
      const reach = clamp(Math.max(w * 0.34, h * 0.75), 80, 560);
      const size = clamp(reach / 240, 0.6, 1.4);
      const d = clamp(L.density, 0, 1);
      const radials = Math.round(lerp(11, 24, d));
      const turns = Math.max(5, Math.round(lerp(8, 22, d) * size));
      const n = radials * turns;
      const hx = L.hubX * w + (rand() - 0.5) * 8;
      const hy = L.hubY * h + (rand() - 0.5) * 8;
      const corners = new Float32Array(CORNERS * 2);
      const anchors = new Float32Array(CORNERS * 2);
      const sway = new Float32Array(CORNERS * 3 + 3);
      const turn0 = rand() * Math.PI * 2;
      for (let m = 0; m < CORNERS; m += 1) {
        const a = turn0 + ((m + (rand() - 0.5) * 0.45) * Math.PI * 2) / CORNERS;
        const r = reach * (0.85 + rand() * 0.3);
        corners[m * 2] = hx + Math.cos(a) * r;
        corners[m * 2 + 1] = hy + Math.sin(a) * r;
        const out = reach * (0.7 + rand() * 0.5);
        const b = a + (rand() - 0.5) * 0.5;
        anchors[m * 2] = (corners[m * 2] ?? 0) + Math.cos(b) * out;
        anchors[m * 2 + 1] = (corners[m * 2 + 1] ?? 0) + Math.sin(b) * out;
        sway[m * 3] = rand() * Math.PI * 2;
        sway[m * 3 + 1] = rand() * Math.PI * 2;
        sway[m * 3 + 2] = 0.25 + rand() * 0.35;
      }
      sway[CORNERS * 3] = rand() * Math.PI * 2;
      sway[CORNERS * 3 + 1] = rand() * Math.PI * 2;
      sway[CORNERS * 3 + 2] = 0.3 + rand() * 0.2;
      // Where each radial's ray from the hub meets the frame.
      const edge = new Uint8Array(radials);
      const along = new Float32Array(radials);
      const angle0 = rand() * Math.PI * 2;
      for (let j = 0; j < radials; j += 1) {
        const a = angle0 + ((j + (rand() - 0.5) * 0.5) * Math.PI * 2) / radials;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        let best = 1e9;
        for (let m = 0; m < CORNERS; m += 1) {
          const ax = (corners[m * 2] ?? 0) - hx;
          const ay = (corners[m * 2 + 1] ?? 0) - hy;
          const bx = (corners[((m + 1) % CORNERS) * 2] ?? 0) - hx;
          const by = (corners[((m + 1) % CORNERS) * 2 + 1] ?? 0) - hy;
          const ex = bx - ax;
          const ey = by - ay;
          const den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = (ax * ey - ay * ex) / den;
          const s = (ax * dy - ay * dx) / den;
          if (t > 0 && s >= 0 && s <= 1 && t < best) {
            best = t;
            edge[j] = m;
            along[j] = s;
          }
        }
      }
      const frac = new Float32Array(n);
      for (let k = 0; k < turns; k += 1) {
        for (let j = 0; j < radials; j += 1) {
          const i = k * radials + j;
          const p = (i + (rand() - 0.5) * 0.3 * radials * 0.5) / n;
          frac[i] = FREE + (REACH - FREE) * Math.pow(clamp(p, 0, 1), 0.92);
        }
      }
      const mesh = new Float32Array(radials * 3);
      for (let j = 0; j < radials; j += 1) {
        for (let q = 0; q < 3; q += 1) {
          mesh[j * 3 + q] = (0.035 + q * 0.04) * (0.8 + rand() * 0.4);
        }
      }
      // Dew gathers toward each segment's middle, where it hangs lowest.
      const want = clamp(L.dew, 0, 1) * 1.7;
      const segs: number[] = [];
      const ts: number[] = [];
      const rs: number[] = [];
      const facets: number[] = [];
      for (let i = 0; i < n - 1; i += 1) {
        let count = Math.floor(want + rand());
        if (rand() < 0.15) count = 0;
        for (let c = 0; c < count && segs.length < 4000; c += 1) {
          segs.push(i);
          const main = c === 0;
          ts.push(
            clamp(0.5 + (rand() - 0.5) * (main ? 0.25 : 0.8), 0.08, 0.92),
          );
          rs.push(main ? 1.2 + rand() * 1.3 : 0.6 + rand() * 0.7);
          facets.push(rand() * Math.PI * 2);
        }
      }
      web = {
        w,
        h,
        dpr: scale,
        radials,
        turns,
        hubX: hx,
        hubY: hy,
        corners,
        anchors,
        sway,
        edge,
        along,
        frac,
        ux: new Float32Array(n),
        uy: new Float32Array(n),
        vx: new Float32Array(n),
        vy: new Float32Array(n),
        hub: { ux: 0, uy: 0, vx: 0, vy: 0 },
        px: new Float32Array(n),
        py: new Float32Array(n),
        ox: new Float32Array(radials),
        oy: new Float32Array(radials),
        cx: new Float32Array(CORNERS),
        cy: new Float32Array(CORNERS),
        mesh,
        dropSeg: Uint16Array.from(segs),
        dropT: Float32Array.from(ts),
        dropR: Float32Array.from(rs),
        dropFacet: Float32Array.from(facets),
        dropFlash: new Float32Array(segs.length),
        stars: new Float32Array(segs.length * 4),
        drops: segs.length,
        reach,
      };
      trembling = false;
    };

    /** Where every node rests this moment, with the anchors' sway, plus its displacement. */
    const place = () => {
      const wb = web;
      if (!wb) return;
      const L = latest.current;
      const amp = L.motionSafe ? wb.reach * 0.012 : 0;
      const sw = wb.sway;
      for (let m = 0; m < CORNERS; m += 1) {
        const f = sw[m * 3 + 2] ?? 0.3;
        wb.cx[m] =
          (wb.corners[m * 2] ?? 0) +
          Math.sin(time * f + (sw[m * 3] ?? 0)) * amp;
        wb.cy[m] =
          (wb.corners[m * 2 + 1] ?? 0) +
          Math.sin(time * f * 0.83 + (sw[m * 3 + 1] ?? 0)) * amp;
      }
      const hf = sw[CORNERS * 3 + 2] ?? 0.3;
      const hx =
        wb.hubX +
        Math.sin(time * hf + (sw[CORNERS * 3] ?? 0)) * amp * 0.6 +
        wb.hub.ux;
      const hy =
        wb.hubY +
        Math.sin(time * hf * 0.9 + (sw[CORNERS * 3 + 1] ?? 0)) * amp * 0.6 +
        wb.hub.uy;
      for (let j = 0; j < wb.radials; j += 1) {
        const m = wb.edge[j] ?? 0;
        const s = wb.along[j] ?? 0;
        const n2 = (m + 1) % CORNERS;
        wb.ox[j] = lerp(wb.cx[m] ?? 0, wb.cx[n2] ?? 0, s);
        wb.oy[j] = lerp(wb.cy[m] ?? 0, wb.cy[n2] ?? 0, s);
      }
      const R = wb.radials;
      for (let i = 0; i < R * wb.turns; i += 1) {
        const j = i % R;
        const f = wb.frac[i] ?? 0;
        wb.px[i] = hx + ((wb.ox[j] ?? 0) - hx) * f + (wb.ux[i] ?? 0);
        wb.py[i] = hy + ((wb.oy[j] ?? 0) - hy) * f + (wb.uy[i] ?? 0);
      }
    };

    /** One physics step of the silk; returns the largest movement left. */
    const integrate = (dt: number): number => {
      const wb = web;
      if (!wb) return 0;
      const L = latest.current;
      const R = wb.radials;
      const n = R * wb.turns;
      // Damping sets how long the web rings: from a quick still (about a
      // sixth of a second) to a long shimmer (about a second).
      const damp = lerp(12, 1.8, clamp(L.ring, 0, 1));
      const { ux, uy, vx, vy, hub: hb } = wb;
      // Only a moving hand drags the silk; a resting one leaves it to ring.
      const handSpeed = Math.hypot(hand.vx, hand.vy);
      const brushing = hand.present && L.interactive && handSpeed > 4;
      const strength =
        clamp(L.pointerStrength, 0, 1) * Math.min(1, handSpeed / 240);
      let residual = 0;
      for (let i = 0; i < n; i += 1) {
        const x = ux[i] ?? 0;
        const y = uy[i] ?? 0;
        const inX = i >= R ? (ux[i - R] ?? 0) : hb.ux;
        const inY = i >= R ? (uy[i - R] ?? 0) : hb.uy;
        const outX = i + R < n ? (ux[i + R] ?? 0) : 0;
        const outY = i + R < n ? (uy[i + R] ?? 0) : 0;
        const prevX = i > 0 ? (ux[i - 1] ?? 0) : x;
        const prevY = i > 0 ? (uy[i - 1] ?? 0) : y;
        const nextX = i + 1 < n ? (ux[i + 1] ?? 0) : x;
        const nextY = i + 1 < n ? (uy[i + 1] ?? 0) : y;
        let ax =
          -HOLD * x +
          TENSION * (inX + outX + prevX + nextX - 4 * x) * 0.5 -
          damp * (vx[i] ?? 0);
        let ay =
          -HOLD * y +
          TENSION * (inY + outY + prevY + nextY - 4 * y) * 0.5 -
          damp * (vy[i] ?? 0);
        if (brushing) {
          // The hand drags the silk it passes through along with it.
          const ddx = (wb.px[i] ?? 0) - hand.x;
          const ddy = (wb.py[i] ?? 0) - hand.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < BRUSH * BRUSH) {
            const fall = 1 - Math.sqrt(d2) / BRUSH;
            const pull = 26 * strength * fall * fall;
            ax += (hand.vx * 0.5 - (vx[i] ?? 0)) * pull;
            ay += (hand.vy * 0.5 - (vy[i] ?? 0)) * pull;
          }
        }
        const nvx = (vx[i] ?? 0) + ax * dt;
        const nvy = (vy[i] ?? 0) + ay * dt;
        vx[i] = nvx;
        vy[i] = nvy;
        ux[i] = clamp(x + nvx * dt, -MAX_PULL, MAX_PULL);
        uy[i] = clamp(y + nvy * dt, -MAX_PULL, MAX_PULL);
        const off =
          Math.abs(x) + Math.abs(y) + (Math.abs(nvx) + Math.abs(nvy)) * 0.02;
        if (off > residual) residual = off;
      }
      // The hub hangs from all the inner nodes.
      let sx = 0;
      let sy = 0;
      for (let j = 0; j < R; j += 1) {
        sx += (ux[j] ?? 0) - hb.ux;
        sy += (uy[j] ?? 0) - hb.uy;
      }
      const hax =
        -HOLD * 2 * hb.ux + ((TENSION * 0.5 * sx) / R) * 2 - damp * hb.vx;
      const hay =
        -HOLD * 2 * hb.uy + ((TENSION * 0.5 * sy) / R) * 2 - damp * hb.vy;
      hb.vx += hax * dt;
      hb.vy += hay * dt;
      hb.ux += hb.vx * dt;
      hb.uy += hb.vy * dt;
      const hubOff =
        Math.abs(hb.ux) +
        Math.abs(hb.uy) +
        (Math.abs(hb.vx) + Math.abs(hb.vy)) * 0.02;
      return Math.max(residual, hubOff);
    };

    const still = () => {
      const wb = web;
      if (!wb) return;
      wb.ux.fill(0);
      wb.uy.fill(0);
      wb.vx.fill(0);
      wb.vy.fill(0);
      wb.hub.ux = 0;
      wb.hub.uy = 0;
      wb.hub.vx = 0;
      wb.hub.vy = 0;
    };

    /**
     * The intro's progress for each part of the web, 0 to 1. The scaffold —
     * frame, moorings, radials — always stands, so the first frame is a web
     * even before the spiral is spun onto it.
     */
    const spun = () => {
      const L = latest.current;
      const spinning =
        introState === "running" ||
        (introState === "waiting" && L.intro && L.motionSafe);
      if (!spinning) return { radial: 1, spiral: 1, dew: 1 };
      const t = introState === "running" ? introClock : 0;
      return {
        radial: 1,
        spiral: clamp(t / 0.5, 0, 1),
        dew: clamp((t - 0.45) / durations.slow, 0, 1),
      };
    };

    const draw = () => {
      const wb = web;
      const lk = look;
      if (!wb || !lk) return;
      if (!visible) {
        dirty = true;
        return;
      }
      dirty = false;
      const L = latest.current;
      place();
      const R = wb.radials;
      const n = R * wb.turns;
      const { px, py } = wb;
      const progress = spun();
      const stagger = cascade(R);
      ctx.setTransform(wb.dpr, 0, 0, wb.dpr, 0, 0);
      ctx.clearRect(0, 0, wb.w, wb.h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const light = L.motionSafe ? time * 0.26 : 2.2;
      const sheenAngle = light + Math.PI / 2;

      // Moorings and the frame.
      const frame = new Path2D();
      for (let m = 0; m < CORNERS; m += 1) {
        const x = wb.cx[m] ?? 0;
        const y = wb.cy[m] ?? 0;
        frame.moveTo(wb.anchors[m * 2] ?? x, wb.anchors[m * 2 + 1] ?? y);
        frame.lineTo(x, y);
        const nx = wb.cx[(m + 1) % CORNERS] ?? x;
        const ny = wb.cy[(m + 1) % CORNERS] ?? y;
        const len = Math.hypot(nx - x, ny - y);
        frame.quadraticCurveTo(
          (x + nx) / 2,
          (y + ny) / 2 + L.sag * 0.04 * len,
          nx,
          ny,
        );
      }
      const frameAlpha = progress.radial;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = rgba(lk.silk, 0.55 * frameAlpha);
      ctx.stroke(frame);

      // Radials, from the hub out through every crossing to the frame.
      const radialPath = new Path2D();
      const hubPx = wb.hubX + wb.hub.ux;
      const hubPy = wb.hubY + wb.hub.uy;
      for (let j = 0; j < R; j += 1) {
        const grow = clamp(
          (progress.radial * (1 + stagger * R) - stagger * j) * 1.4,
          0,
          1,
        );
        if (grow <= 0) continue;
        radialPath.moveTo(hubPx, hubPy);
        let lastX = hubPx;
        let lastY = hubPy;
        const end = grow * REACH;
        let k = 0;
        for (; k < wb.turns; k += 1) {
          const i = k * R + j;
          if ((wb.frac[i] ?? 1) > end) break;
          lastX = px[i] ?? lastX;
          lastY = py[i] ?? lastY;
          radialPath.lineTo(lastX, lastY);
        }
        if (grow >= 1) {
          radialPath.lineTo(wb.ox[j] ?? lastX, wb.oy[j] ?? lastY);
        } else {
          const tx = hubPx + ((wb.ox[j] ?? hubPx) - hubPx) * end;
          const ty = hubPy + ((wb.oy[j] ?? hubPy) - hubPy) * end;
          radialPath.lineTo(tx, ty);
        }
      }
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = rgba(lk.silk, 0.6);
      ctx.stroke(radialPath);

      // The hub's mesh.
      if (progress.radial >= 1) {
        const meshPath = new Path2D();
        for (let q = 0; q < 3; q += 1) {
          for (let j = 0; j <= R; j += 1) {
            const jj = j % R;
            const f = wb.mesh[jj * 3 + q] ?? 0.05;
            const x = hubPx + ((wb.ox[jj] ?? 0) - hubPx) * f;
            const y = hubPy + ((wb.oy[jj] ?? 0) - hubPy) * f;
            if (j === 0) meshPath.moveTo(x, y);
            else meshPath.lineTo(x, y);
          }
        }
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = rgba(lk.silk, 0.45);
        ctx.stroke(meshPath);
      }

      // The capture spiral, segment by segment, drooping; silk lying across
      // the light carries a sheen.
      const spiral = new Path2D();
      const sheen = [new Path2D(), new Path2D(), new Path2D()];
      const shown = Math.floor(progress.spiral * (n - 1));
      const droop = clamp(L.sag, 0, 1) * 0.2;
      const glow = clamp(L.glint, 0, 1);
      for (let i = 0; i < shown; i += 1) {
        const x0 = px[i] ?? 0;
        const y0 = py[i] ?? 0;
        const x1 = px[i + 1] ?? x0;
        const y1 = py[i + 1] ?? y0;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const qx = (x0 + x1) / 2;
        const qy = (y0 + y1) / 2 + droop * len;
        spiral.moveTo(x0, y0);
        spiral.quadraticCurveTo(qx, qy, x1, y1);
        if (glow > 0 && len > 0.5) {
          const c = Math.abs(
            (dx * Math.cos(sheenAngle) + dy * Math.sin(sheenAngle)) / len,
          );
          const lit = c * c * c * c * c * c * c * c;
          const band = lit > 0.75 ? 2 : lit > 0.45 ? 1 : lit > 0.2 ? 0 : -1;
          const path = band >= 0 ? sheen[band] : undefined;
          if (path) {
            path.moveTo(x0, y0);
            path.quadraticCurveTo(qx, qy, x1, y1);
          }
        }
      }
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = rgba(lk.silk, 0.5);
      ctx.stroke(spiral);
      if (glow > 0) {
        ctx.globalCompositeOperation = lk.dark ? "lighter" : "source-over";
        ctx.lineWidth = 0.9;
        for (let b = 0; b < 3; b += 1) {
          const path = sheen[b];
          if (!path) continue;
          ctx.strokeStyle = rgba(
            lk.glint,
            glow * (lk.dark ? 0.2 : 0.35) * (b + 1),
          );
          ctx.stroke(path);
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // Dew: each drop on its segment's droop, a lens, and a flash when its
      // facet turns to the light — or swings through it.
      if (progress.dew > 0) {
        const grow = progress.dew;
        const droopK = droop;
        const stars = wb.stars;
        let lit = 0;
        for (let d = 0; d < wb.drops; d += 1) {
          const i = wb.dropSeg[d] ?? 0;
          if (i >= shown) continue;
          const t = wb.dropT[d] ?? 0.5;
          const x0 = px[i] ?? 0;
          const y0 = py[i] ?? 0;
          const x1 = px[i + 1] ?? x0;
          const y1 = py[i + 1] ?? y0;
          const len = Math.hypot(x1 - x0, y1 - y0);
          const qx = (x0 + x1) / 2;
          const qy = (y0 + y1) / 2 + droopK * len;
          const a = (1 - t) * (1 - t);
          const b = 2 * (1 - t) * t;
          const c = t * t;
          const x = a * x0 + b * qx + c * x1;
          const y = a * y0 + b * qy + c * y1;
          const r = (wb.dropR[d] ?? 1) * grow;
          ctx.drawImage(lk.bead, x - r, y - r, r * 2, r * 2);
          if (glow <= 0) continue;
          const swing = ((wb.vx[i] ?? 0) - (wb.vy[i] ?? 0)) * 0.006;
          const facing = Math.cos((wb.dropFacet[d] ?? 0) - light + swing);
          let g = facing > 0 ? Math.pow(facing, 28) : 0;
          g = Math.min(1, g + (wb.dropFlash[d] ?? 0));
          if (g * glow > 0.04) {
            stars[lit] = x;
            stars[lit + 1] = y;
            stars[lit + 2] = r;
            stars[lit + 3] = g * glow;
            lit += 4;
          }
        }
        ctx.globalCompositeOperation = lk.dark ? "lighter" : "source-over";
        for (let s = 0; s < lit; s += 4) {
          const x = stars[s] ?? 0;
          const y = stars[s + 1] ?? 0;
          const r = stars[s + 2] ?? 1;
          const g = stars[s + 3] ?? 0;
          const size = Math.max(2.5, r) * (2.6 + 8 * g);
          ctx.globalAlpha = Math.min(1, g * 1.2);
          ctx.drawImage(lk.star, x - size, y - size, size * 2, size * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      root.setAttribute("data-painted", "");
    };

    const settleThreshold = 0.05;
    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden || !web) {
        last = 0;
        return;
      }
      const L = latest.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let busy = false;
      if (!L.motionSafe) {
        // Reduced motion: only a press's flash fades.
        let flashing = false;
        for (let d = 0; d < web.drops; d += 1) {
          const f = web.dropFlash[d] ?? 0;
          if (f > 0) {
            web.dropFlash[d] = Math.max(0, f - dt / 0.6);
            flashing = true;
          }
        }
        draw();
        if (flashing) raf = window.requestAnimationFrame(frame);
        else last = 0;
        return;
      }
      const ambient = !L.paused && L.speed > 0;
      if (ambient) time += dt * clamp(L.speed, 0, 2);
      if (introState === "running") {
        introClock += dt;
        if (introClock > 0.45 + durations.slow) introState = "done";
        busy = true;
      }
      // A resting hand is no force on the silk; only a moving one brushes.
      const moving = hand.present && Math.abs(hand.vx) + Math.abs(hand.vy) > 4;
      if (trembling || moving) {
        let left = dt;
        let residual = 0;
        while (left > 1e-6) {
          const h = Math.min(STEP, left);
          left -= h;
          residual = integrate(h);
        }
        const fade = Math.exp(-dt / 0.06);
        hand.vx *= fade;
        hand.vy *= fade;
        trembling = residual > settleThreshold;
        if (!trembling && !moving) still();
        busy = busy || trembling || moving;
      }
      // The slow sway and light need only half the frames.
      const due = busy || now - drawnAt > 31;
      if (due) {
        drawnAt = now;
        draw();
      }
      if (busy || ambient) raf = window.requestAnimationFrame(frame);
      else last = 0;
    };

    const kick = () => {
      if (raf || disposed) return;
      if (!visible || document.hidden) {
        dirty = true;
        return;
      }
      raf = window.requestAnimationFrame(frame);
    };

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };

    const resize = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      if (web && web.w === w && web.h === h) return;
      build();
      draw();
    };

    recolor();
    resize();

    const sizer = new ResizeObserver(() => resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (!visible) return;
      if (introState === "waiting") {
        const L = latest.current;
        introState = L.intro && L.motionSafe ? "running" : "done";
        introClock = 0;
      }
      if (dirty) draw();
      kick();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const local = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      return {
        x: clientX - rect.left - root.clientLeft,
        y: clientY - rect.top - root.clientTop,
      };
    };

    api.current = {
      refresh: (rebuild) => {
        if (rebuild) build();
        if (!latest.current.motionSafe) {
          stop();
          still();
          trembling = false;
          if (introState === "running") introState = "done";
        }
        draw();
        kick();
      },
      recolor: () => {
        recolor();
        draw();
      },
      local,
      brush: (x, y, at) => {
        const dt = hand.at ? Math.max(8, at - hand.at) / 1000 : 0;
        if (dt > 0 && hand.present) {
          const k = Math.min(1, dt / 0.05);
          hand.vx += ((x - hand.x) / dt - hand.vx) * k;
          hand.vy += ((y - hand.y) / dt - hand.vy) * k;
        } else {
          hand.vx = 0;
          hand.vy = 0;
        }
        hand.x = x;
        hand.y = y;
        hand.at = at;
        hand.present = latest.current.motionSafe;
        if (hand.present) trembling = true;
        kick();
      },
      lift: () => {
        hand.present = false;
        hand.at = 0;
        kick();
      },
      pluck: (x, y, strength) => {
        const wb = web;
        if (!wb) return;
        place();
        const R = wb.radials;
        const n = R * wb.turns;
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < n; i += 1) {
          const d = Math.hypot((wb.px[i] ?? 0) - x, (wb.py[i] ?? 0) - y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best < 0) return;
        const L = latest.current;
        if (!L.motionSafe) {
          // Reduced motion: the dew near the hand catches the light instead.
          for (let d = 0; d < wb.drops; d += 1) {
            const i = wb.dropSeg[d] ?? 0;
            const dd = Math.hypot((wb.px[i] ?? 0) - x, (wb.py[i] ?? 0) - y);
            if (dd < BRUSH * 1.6) wb.dropFlash[d] = 1 - dd / (BRUSH * 1.6);
          }
          L.onPluck?.();
          kick();
          return;
        }
        // A pluck pulls the thread out across its radial and lets it go.
        const j = best % R;
        const ax = (wb.ox[j] ?? 0) - wb.hubX;
        const ay = (wb.oy[j] ?? 0) - wb.hubY;
        const al = Math.hypot(ax, ay) || 1;
        const kick0 = 640 * clamp(L.pointerStrength, 0, 1) * strength;
        const nx = -ay / al;
        const ny = ax / al;
        // The plucked node and its neighbours along the spiral and the radial
        // go first; the springs carry the rest.
        for (let dk = -2; dk <= 2; dk += 1) {
          for (let dj = -2; dj <= 2; dj += 1) {
            const i = best + dk * R + dj;
            if (i < 0 || i >= n) continue;
            const share = Math.exp(-(dk * dk + dj * dj) * 0.45);
            wb.vx[i] = (wb.vx[i] ?? 0) + nx * kick0 * share;
            wb.vy[i] = (wb.vy[i] ?? 0) + ny * kick0 * share;
          }
        }
        trembling = true;
        L.onPluck?.();
        kick();
      },
    };

    return () => {
      disposed = true;
      stop();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, []);

  // The web is spun again for a new density, seed, hub or dew; the rest is
  // read each frame.
  React.useEffect(() => {
    api.current?.refresh(true);
  }, [density, dew, seed, hubX, hubY, dpr]);
  React.useEffect(() => {
    api.current?.refresh(false);
  }, [sag, glint, ring, speed, paused, motionSafe]);

  // A hand that is switched off lets go.
  React.useEffect(() => {
    if (!interactive) api.current?.lift();
  }, [interactive]);

  // A new theme or new colours change the carriers'; their 1 ms colour
  // transition says when, and the silk and the dew are drawn from them again.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.recolor();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive || event.pointerType === "touch") return;
    const at = a.local(event.clientX, event.clientY);
    a.brush(at.x, at.y, event.timeStamp);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // Pressing a button in the content is the button's business.
    if (hit && rootRef.current?.contains(hit)) return;
    const at = a.local(event.clientX, event.clientY);
    a.pluck(at.x, at.y, 1);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    api.current?.lift();
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const a = api.current;
    const target = event.target;
    if (!a || !interactive || !(target instanceof Element)) return;
    if (!target.matches(":focus-visible")) return;
    const rect = target.getBoundingClientRect();
    const at = a.local(rect.left + rect.width / 2, rect.top + rect.height / 2);
    a.pluck(at.x, at.y, 0.45);
  };

  // The morning air, painted by CSS so the server draws it too: a mist
  // falling off from the top and a few out-of-focus drops far behind.
  const bokeh = BOKEH.map(
    ([x, y, r]) =>
      `radial-gradient(circle at ${x}% ${y}%, color-mix(in oklab, ${glintColor} 16%, transparent) 0, color-mix(in oklab, ${glintColor} 6%, transparent) ${r}px, transparent ${Math.round(r * 2.2)}px)`,
  ).join(", ");
  const air = `${bokeh}, radial-gradient(120% 90% at 70% 10%, ${mist} 0%, color-mix(in oklab, ${mist} 55%, var(--background)) 70%, var(--background) 100%)`;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      className={cn(
        "group/dew-web relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: air }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-painted/dew-web:opacity-100"
        />
        <span
          ref={silkRef}
          onTransitionEnd={onColors}
          className="absolute size-px opacity-0 transition-colors duration-1"
          style={{ color: silk }}
        />
        <span
          ref={glintRef}
          onTransitionEnd={onColors}
          className="absolute size-px opacity-0 transition-colors duration-1"
          style={{ color: glintColor }}
        />
        <span
          ref={pageRef}
          onTransitionEnd={onColors}
          className="absolute size-px bg-background text-background opacity-0 transition-colors duration-1"
        />
      </div>
      <div className={cn("relative z-10 size-full", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
