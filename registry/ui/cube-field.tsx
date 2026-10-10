"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CubeFieldSpring = "snap" | "glide" | "drift";
export type CubeFieldRenderer = "auto" | "css" | "canvas";

export type CubeFieldProps = {
  /** Content laid over the floor, such as a hero. It stays fully interactive; the cubes never take a click. */
  children?: React.ReactNode;
  /** A cube's edge on the floor, in px — the grid's pitch. @default 48 */
  grid?: number;
  /** How high the cubes under the pointer climb, in px. @default 36 */
  rise?: number;
  /** How far the rise reaches, in cubes, fading to nothing along a raised-cosine bell. @default 3.5 */
  falloff?: number;
  /** Every cube's resting height, in px, so the floor shows its sides at rest. @default 6 */
  base?: number;
  /** The calibrated spring the cubes rise and settle on. @default "snap" */
  spring?: CubeFieldSpring;
  /** Strength of the wave a click sends through the floor, 0 to 2; 0 turns it off. @default 1 */
  wave?: number;
  /** How fast the wave travels, as a multiple of 14 cubes a second (0.5 to 2). @default 1 */
  waveSpeed?: number;
  /** The cubes' tops, any CSS colour. @default "var(--card)" */
  topColor?: string;
  /** The colour the sides are shaded from, toward black in oklab. @default "var(--card)" */
  sideColor?: string;
  /** The colour a risen top glows toward. @default "var(--accent-bright)" */
  glowColor?: string;
  /** How strongly a fully risen top glows, 0 to 1. @default 0.55 */
  glow?: number;
  /** How dark the sides are, 0 to 1: the left face takes half of it, the right face all. @default 0.5 */
  shade?: number;
  /** CSS 3D cubes, canvas polygons, or CSS until the floor needs more than 260 cubes. @default "auto" */
  renderer?: CubeFieldRenderer;
  /** One gentle wave from the centre the first time it comes into view. @default true */
  intro?: boolean;
  /** Keyboard focus inside raises the floor under the focused control. @default true */
  followFocus?: boolean;
  /** The pointer raises the floor (mouse and pen); a click or a tap sends a wave. @default true */
  interactive?: boolean;
  /** Holds every cube where it is. @default false */
  paused?: boolean;
  /** The highest device pixel ratio the canvas renderer draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a visitor sends a wave with a click or a tap. */
  onWave?: () => void;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
};

type Rgb = [number, number, number];

/** The isometric projection: the floor turned 45° and tilted 60°. */
const HALF_W = Math.SQRT1_2;
const HALF_H = Math.SQRT1_2 / 2;
const LIFT = Math.sqrt(3) / 2;
/** Above this many cubes the canvas draws the floor instead of the DOM. */
const CSS_BUDGET = 260;
/** Side faces are drawn this long and scaled to the cube's height. */
const UNIT = 100;
const WAVE_CELLS = 14;
const WAVE_DAMP = 2.6;
const WAVE_HOLD = 10;
/** Damps short wavelengths so a knock spreads as one smooth ring. */
const WAVE_VISCOSITY = 8;
const TAP_HOLD = 700;
const GLOW_STEPS = 24;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(clamp(v, 0, 1) * 100);
const bell = (x: number) => (x >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * x));

/** Resolves any CSS colour the canvas can parse into its sRGB bytes. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const toByte = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(clamp(c, 0, 1) * 255);
};

/**
 * A colour mixed toward black in oklab — the same mix the CSS cubes ask
 * for with `color-mix(in oklab, …)`, so both renderers shade alike.
 */
function towardBlack([r, g, b]: Rgb, share: number): Rgb {
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
  const k = 1 - clamp(share, 0, 1);
  const L = (0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s) * k;
  const A = (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * k;
  const B = (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s) * k;
  const l3 = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m3 = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s3 = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  return [
    toByte(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    toByte(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    toByte(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ];
}

const rgb = (c: Rgb, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${r2(a)})`;

/**
 * A floor of cubes in true isometric (the square floor turned 45° and
 * tilted 60°) that fills the box behind its children. Each cube shows its
 * top and its two near faces, shaded per face from tokens so the floor
 * reads lit from the upper left in either theme, and risen tops glow toward
 * the accent.
 *
 * Two layers of physics, summed per cube. The rise: every cube is a spring
 * with the chosen calibrated constants toward a height of `rise` under the
 * pointer, falling to nothing over `falloff` cubes on a raised-cosine bell
 * measured on the floor plane, so a hill follows the hand and settles back
 * when it leaves. The wave: a click knocks the cubes under it upward, and
 * the floor is a lightly damped lattice — each cube coupled to its four
 * neighbours by a discrete wave equation — so a real ring of risen cubes
 * spreads outward, disperses and is absorbed at the edges.
 *
 * Rendered as CSS 3D — every cube its own small `preserve-3d` object, laid
 * out back to front, so a frame is only transforms and an opacity — and as
 * polygons on a canvas when the floor would need more than 260 cubes, when
 * 3D transforms are unavailable, or when asked. The loop runs only while a
 * cube is moving, on screen, in a visible tab. Under reduced motion the floor
 * stays flat and the tops under the pointer brighten instead.
 */
export function CubeField({
  children,
  grid = 48,
  rise = 36,
  falloff = 3.5,
  base = 6,
  spring = "snap",
  wave = 1,
  waveSpeed = 1,
  topColor = "var(--card)",
  sideColor = "var(--card)",
  glowColor = "var(--accent-bright)",
  glow = 0.55,
  shade = 0.5,
  renderer = "auto",
  intro = true,
  followFocus = true,
  interactive = true,
  paused = false,
  dpr = 2,
  onWave,
  className,
}: CubeFieldProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const floorRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const placeholderRef = React.useRef<HTMLSpanElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);

  const pitch = clamp(grid, 16, 160);
  const params = React.useRef({
    pitch,
    rise,
    falloff,
    base,
    spring,
    wave,
    waveSpeed,
    topColor,
    sideColor,
    glowColor,
    glow,
    shade,
    renderer,
    intro,
    interactive,
    paused,
    dpr,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      pitch,
      rise,
      falloff,
      base,
      spring,
      wave,
      waveSpeed,
      topColor,
      sideColor,
      glowColor,
      glow,
      shade,
      renderer,
      intro,
      interactive,
      paused,
      dpr,
      motionSafe,
    };
  });

  const api = React.useRef<{
    point: (x: number, y: number) => void;
    leave: () => void;
    push: (x: number, y: number, strength: number) => void;
    tap: (x: number, y: number) => void;
    focus: (node: HTMLElement | null) => void;
    rebuild: () => void;
    restyle: () => void;
    retheme: () => void;
    wake: () => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const floor = floorRef.current;
    const canvas = canvasRef.current;
    if (!root || !floor || !canvas) return;
    const read = rgbReader();
    const supports3d =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("transform-style", "preserve-3d");

    let w = 0;
    let h = 0;
    let ratio = 1;
    let mode: "css" | "canvas" = "css";
    let a = 1;
    let b = 1;
    let ox = 0;
    let oy = 0;
    let n = 0;
    // Per cube, in painter's order (back to front).
    let cc = new Int32Array(0);
    let cr = new Int32Array(0);
    let sx = new Float32Array(0);
    let sy = new Float32Array(0);
    let nb = new Int32Array(0);
    let damp = new Float32Array(0);
    let target = new Float32Array(0);
    let y = new Float32Array(0);
    let vy = new Float32Array(0);
    let wv = new Float32Array(0);
    let vw = new Float32Array(0);
    let acc = new Float32Array(0);
    let shine = new Float32Array(0);
    let shownH = new Float32Array(0);
    let shownG = new Float32Array(0);
    let tops: HTMLDivElement[] = [];
    let glows: HTMLDivElement[] = [];
    let easts: HTMLDivElement[] = [];
    let souths: HTMLDivElement[] = [];
    let raf = 0;
    let last = 0;
    let inView = false;
    let introduced = false;
    let ctx: CanvasRenderingContext2D | null = null;
    let builtKey = "";
    const fills = {
      top: "",
      left: "",
      right: "",
      edge: "",
      glow: [] as string[],
    };
    const paint = {
      top: [128, 128, 128] as Rgb,
      left: [96, 96, 96] as Rgb,
      right: [64, 64, 64] as Rgb,
      glow: [90, 110, 220] as Rgb,
      edge: [0, 0, 0] as Rgb,
    };

    // Where the floor is being raised: the pointer, a focused element, a tap.
    const source = { x: 0, y: 0, on: false };
    const focusAt = { x: 0, y: 0, on: false };
    const tapAt = { x: 0, y: 0, on: false };
    let tapTimer = 0;

    const clearFloor = () => {
      floor.replaceChildren();
      tops = [];
      glows = [];
      easts = [];
      souths = [];
    };

    const buildCss = () => {
      const p = params.current;
      const s = p.pitch;
      const edge = "color-mix(in oklab, var(--foreground) 7%, transparent)";
      const left = `color-mix(in oklab, ${p.sideColor}, black ${pct(p.shade * 0.36)}%)`;
      const right = `color-mix(in oklab, ${p.sideColor}, black ${pct(p.shade * 0.72)}%)`;
      const deep = (c: string) =>
        `linear-gradient(to right, color-mix(in oklab, ${c}, black 12%), ${c} 70%)`;
      const deepY = (c: string) =>
        `linear-gradient(to bottom, color-mix(in oklab, ${c}, black 12%), ${c} 70%)`;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i += 1) {
        const cube = document.createElement("div");
        cube.style.cssText = `position:absolute;left:0;top:0;width:${r2(s)}px;height:${r2(s)}px;transform-origin:0 0;transform-style:preserve-3d;transform:translate(${r2(sx[i] ?? 0)}px, ${r2(sy[i] ?? 0)}px) rotateX(60deg) rotateZ(45deg)`;
        const top = document.createElement("div");
        top.style.cssText = `position:absolute;inset:-0.4px;background:${p.topColor};box-shadow:inset 0 0 0 1px ${edge};transform:translateZ(${r2(p.base)}px)`;
        const lit = document.createElement("div");
        lit.style.cssText = `position:absolute;inset:0;background:${p.glowColor};opacity:0`;
        top.appendChild(lit);
        const east = document.createElement("div");
        east.style.cssText = `position:absolute;left:${r2(s)}px;top:-0.4px;width:${UNIT}px;height:${r2(s + 0.8)}px;transform-origin:0 0;background:${right};background-image:${deep(right)};transform:rotateY(-90deg) scaleX(${r2(p.base / UNIT)})`;
        const south = document.createElement("div");
        south.style.cssText = `position:absolute;left:-0.4px;top:${r2(s)}px;width:${r2(s + 0.8)}px;height:${UNIT}px;transform-origin:0 0;background:${left};background-image:${deepY(left)};transform:rotateX(90deg) scaleY(${r2(p.base / UNIT)})`;
        cube.append(top, east, south);
        frag.appendChild(cube);
        tops.push(top);
        glows.push(lit);
        easts.push(east);
        souths.push(south);
      }
      floor.replaceChildren(frag);
      shownH.fill(-1);
      shownG.fill(-1);
      builtKey = [p.topColor, p.sideColor, p.glowColor, p.shade].join("|");
    };

    const restyle = () => {
      const probe = probeRef.current;
      if (!probe) return;
      const p = params.current;
      const resolve = (css: string) => {
        probe.style.color = css;
        return read(getComputedStyle(probe).color);
      };
      paint.top = resolve(p.topColor);
      const side = resolve(p.sideColor);
      paint.left = towardBlack(side, p.shade * 0.36);
      paint.right = towardBlack(side, p.shade * 0.72);
      paint.glow = resolve(p.glowColor);
      paint.edge = resolve("var(--foreground)");
      // Fill strings made once, so a canvas frame allocates none.
      fills.top = rgb(paint.top);
      fills.left = rgb(paint.left);
      fills.right = rgb(paint.right);
      fills.edge = rgb(paint.edge, 0.07);
      fills.glow = Array.from({ length: GLOW_STEPS + 1 }, (_, k) =>
        rgb(paint.glow, k / GLOW_STEPS),
      );
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
      if (w < 1 || h < 1) return false;
      const p = params.current;
      const s = p.pitch;
      a = s * HALF_W;
      b = s * HALF_H;
      ox = w / 2;
      oy = h / 2 - b;
      // Only cubes that can be seen: a cube spans X ± a across and from its
      // floor (Y + 2b) up to its top, so a row below the box only counts if
      // a full rise could bring it into view.
      const headroom = LIFT * (p.base + p.rise);
      const U = Math.ceil(w / 2 / a);
      const vMin = Math.floor((-2 * b - oy) / b);
      const vMax = Math.ceil((h + headroom - oy) / b);
      const cells: [number, number][] = [];
      for (let v = vMin; v <= vMax; v += 1) {
        for (let u = -U; u <= U; u += 1) {
          if ((((u + v) % 2) + 2) % 2 !== 0) continue;
          cells.push([(u + v) / 2, (v - u) / 2]);
        }
      }
      n = cells.length;
      cc = new Int32Array(n);
      cr = new Int32Array(n);
      sx = new Float32Array(n);
      sy = new Float32Array(n);
      nb = new Int32Array(n * 4).fill(-1);
      damp = new Float32Array(n);
      target = new Float32Array(n);
      y = new Float32Array(n);
      vy = new Float32Array(n);
      wv = new Float32Array(n);
      vw = new Float32Array(n);
      acc = new Float32Array(n);
      shine = new Float32Array(n);
      shownH = new Float32Array(n);
      shownG = new Float32Array(n);
      const index = new Map<string, number>();
      cells.forEach(([c, r], i) => {
        cc[i] = c;
        cr[i] = r;
        sx[i] = ox + (c - r) * a;
        sy[i] = oy + (c + r) * b;
        index.set(`${c}:${r}`, i);
      });
      for (let i = 0; i < n; i += 1) {
        const c = cc[i] ?? 0;
        const r = cr[i] ?? 0;
        nb[i * 4] = index.get(`${c + 1}:${r}`) ?? -1;
        nb[i * 4 + 1] = index.get(`${c - 1}:${r}`) ?? -1;
        nb[i * 4 + 2] = index.get(`${c}:${r + 1}`) ?? -1;
        nb[i * 4 + 3] = index.get(`${c}:${r - 1}`) ?? -1;
        // A sponge at the floor's edge drinks the wave instead of
        // reflecting it back across the box.
        const x = sx[i] ?? 0;
        const yy = (sy[i] ?? 0) + b;
        const edge = Math.min(x, w - x, yy, h - yy) / (2 * a);
        damp[i] = WAVE_DAMP + 14 * clamp(1 - edge, 0, 1);
      }
      ratio = Math.min(2, Math.max(1, p.dpr), window.devicePixelRatio || 1);
      const want =
        p.renderer === "canvas" ||
        (p.renderer === "auto" && (n > CSS_BUDGET || !supports3d)) ||
        !supports3d
          ? "canvas"
          : "css";
      mode = want;
      if (mode === "css") {
        ctx = null;
        canvas.width = 1;
        canvas.height = 1;
        canvas.style.visibility = "hidden";
        buildCss();
      } else {
        clearFloor();
        canvas.style.visibility = "visible";
        canvas.width = Math.max(1, Math.round(w * ratio));
        canvas.height = Math.max(1, Math.round(h * ratio));
        ctx = canvas.getContext("2d");
      }
      placeholderRef.current?.style.setProperty("opacity", "0");
      return true;
    };

    /** The wave as shown: ripples under a pixel are not drawn, so a dying
     * ring fades out instead of leaving a scatter of one-pixel ledges; the
     * ring glows four times as readily as the hill, so a few pixels of
     * travelling wave still read as a band of light. */
    const ripple = (i: number) => {
      const v = wv[i] ?? 0;
      return Math.sign(v) * Math.max(0, Math.abs(v) - 0.8);
    };
    const heightOf = (i: number) => {
      const p = params.current;
      return clamp(p.base + (y[i] ?? 0) + ripple(i), 1, p.base + p.rise * 1.6);
    };

    const drawCss = () => {
      const p = params.current;
      const peak = clamp(p.glow, 0, 1);
      const reach = Math.max(1, p.rise);
      for (let i = 0; i < n; i += 1) {
        const H = heightOf(i);
        const g = p.motionSafe
          ? peak * clamp(((y[i] ?? 0) + 4 * ripple(i)) / reach, 0, 1)
          : peak * (shine[i] ?? 0);
        if (Math.abs(H - (shownH[i] ?? -1)) > 0.05) {
          shownH[i] = H;
          const top = tops[i];
          const east = easts[i];
          const south = souths[i];
          if (top) top.style.transform = `translateZ(${r2(H)}px)`;
          if (east) {
            east.style.transform = `rotateY(-90deg) scaleX(${r2(H / UNIT)})`;
          }
          if (south) {
            south.style.transform = `rotateX(90deg) scaleY(${r2(H / UNIT)})`;
          }
        }
        if (Math.abs(g - (shownG[i] ?? -1)) > 0.01) {
          shownG[i] = g;
          const lit = glows[i];
          if (lit) lit.style.opacity = String(r2(g));
        }
      }
    };

    const drawCanvas = () => {
      const g = ctx;
      if (!g) return;
      const p = params.current;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const peak = clamp(p.glow, 0, 1);
      const reach = Math.max(1, p.rise);
      const { top, left, right, edge } = fills;
      g.lineWidth = 1;
      g.lineJoin = "round";
      for (let i = 0; i < n; i += 1) {
        const X = sx[i] ?? 0;
        const Y = sy[i] ?? 0;
        const H = heightOf(i);
        const up = LIFT * H;
        if (X + a < 0 || X - a > w || Y - up > h || Y + 2 * b < 0) continue;
        // Left (lit) face, then the right (shadowed) face, then the top.
        g.fillStyle = left;
        g.beginPath();
        g.moveTo(X - a, Y + b - up);
        g.lineTo(X, Y + 2 * b - up);
        g.lineTo(X, Y + 2 * b + 0.5);
        g.lineTo(X - a, Y + b + 0.5);
        g.closePath();
        g.fill();
        g.fillStyle = right;
        g.beginPath();
        g.moveTo(X, Y + 2 * b - up);
        g.lineTo(X + a, Y + b - up);
        g.lineTo(X + a, Y + b + 0.5);
        g.lineTo(X, Y + 2 * b + 0.5);
        g.closePath();
        g.fill();
        g.beginPath();
        g.moveTo(X, Y - up);
        g.lineTo(X + a, Y + b - up);
        g.lineTo(X, Y + 2 * b - up);
        g.lineTo(X - a, Y + b - up);
        g.closePath();
        g.fillStyle = top;
        g.fill();
        const lit = p.motionSafe
          ? peak * clamp(((y[i] ?? 0) + 4 * ripple(i)) / reach, 0, 1)
          : peak * (shine[i] ?? 0);
        if (lit > 0.01) {
          g.fillStyle = fills.glow[Math.round(lit * GLOW_STEPS)] ?? fills.top;
          g.fill();
        }
        g.strokeStyle = edge;
        g.stroke();
      }
    };

    const draw = () => {
      if (n === 0) return;
      if (mode === "css") drawCss();
      else drawCanvas();
    };

    /** The floor point under a screen point, in cubes, near the hill's top. */
    const onFloor = (x: number, yy: number) => {
      const p = params.current;
      const lifted = yy + LIFT * (p.base + p.rise * 0.8);
      const u = (x - ox) / a;
      const v = (lifted - oy) / b;
      return { c: (u + v) / 2, r: (v - u) / 2 };
    };

    const aim = () => {
      const p = params.current;
      const src =
        source.on && p.interactive
          ? source
          : focusAt.on
            ? focusAt
            : tapAt.on
              ? tapAt
              : null;
      if (!src) {
        target.fill(0);
        shine.fill(0);
        return;
      }
      const at = onFloor(src.x, src.y);
      const spread = Math.max(0.5, p.falloff);
      for (let i = 0; i < n; i += 1) {
        const dc = (cc[i] ?? 0) + 0.5 - at.c;
        const dr = (cr[i] ?? 0) + 0.5 - at.r;
        const k = bell(Math.sqrt(dc * dc + dr * dr) / spread);
        target[i] = p.rise * k;
        shine[i] = k;
      }
    };

    let settled = true;
    const step = (dt: number) => {
      const p = params.current;
      const sp = springs[p.spring] ?? springs.snap;
      const k = sp.stiffness / sp.mass;
      const c = sp.damping / sp.mass;
      const speed = clamp(p.waveSpeed, 0.5, 2) * WAVE_CELLS;
      const kappa = speed * speed;
      let busy = false;
      for (let i = 0; i < n; i += 1) {
        const yi = y[i] ?? 0;
        const vi =
          (vy[i] ?? 0) + (k * ((target[i] ?? 0) - yi) - c * (vy[i] ?? 0)) * dt;
        vy[i] = vi;
        y[i] = yi + vi * dt;
        const wi = wv[i] ?? 0;
        const ui = vw[i] ?? 0;
        let lap = 0;
        let flow = 0;
        for (let j = 0; j < 4; j += 1) {
          const o = nb[i * 4 + j] ?? -1;
          if (o < 0) continue;
          lap += (wv[o] ?? 0) - wi;
          flow += (vw[o] ?? 0) - ui;
        }
        acc[i] =
          kappa * lap +
          WAVE_VISCOSITY * flow -
          (damp[i] ?? WAVE_DAMP) * ui -
          WAVE_HOLD * wi;
        if (
          !busy &&
          (Math.abs((target[i] ?? 0) - yi) > 0.05 ||
            Math.abs(vi) > 0.05 ||
            Math.abs(wi) > 0.15 ||
            Math.abs(ui) > 1)
        ) {
          busy = true;
        }
      }
      for (let i = 0; i < n; i += 1) {
        const v = (vw[i] ?? 0) + (acc[i] ?? 0) * dt;
        vw[i] = v;
        wv[i] = (wv[i] ?? 0) + v * dt;
      }
      settled = !busy;
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      aim();
      let t = dt;
      while (t > 1e-6) {
        const d = Math.min(t, 1 / 240);
        step(d);
        t -= d;
      }
      if (settled) {
        for (let i = 0; i < n; i += 1) {
          y[i] = target[i] ?? 0;
          vy[i] = 0;
          wv[i] = 0;
          vw[i] = 0;
        }
        draw();
        last = 0;
        return;
      }
      draw();
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe) {
        y.fill(0);
        vy.fill(0);
        wv.fill(0);
        vw.fill(0);
        aim();
        draw();
        return;
      }
      if (p.paused) {
        draw();
        return;
      }
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    /** A knock on the floor at a screen point: the cubes there jump, and the lattice carries it outward as a ring. */
    const push = (x: number, yy: number, strength: number) => {
      const p = params.current;
      if (!p.motionSafe || p.paused || n === 0) return;
      const s = clamp(p.wave, 0, 2) * strength;
      if (s <= 0) return;
      const at = onFloor(x, yy);
      const kick = 28 * Math.max(8, p.rise) * s;
      for (let i = 0; i < n; i += 1) {
        const dc = (cc[i] ?? 0) + 0.5 - at.c;
        const dr = (cr[i] ?? 0) + 0.5 - at.r;
        const d2 = dc * dc + dr * dr;
        if (d2 > 16) continue;
        vw[i] = (vw[i] ?? 0) + kick * Math.exp(-d2 / 3);
      }
      wake();
    };

    const placeFocus = (node: HTMLElement) => {
      const outer = root.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      focusAt.x = box.left + box.width / 2 - outer.left;
      focusAt.y = box.top + box.height / 2 - outer.top;
    };

    api.current = {
      point: (x, yy) => {
        source.x = x;
        source.y = yy;
        source.on = true;
        wake();
      },
      leave: () => {
        if (!source.on) return;
        source.on = false;
        wake();
      },
      push,
      tap: (x, yy) => {
        tapAt.x = x;
        tapAt.y = yy;
        tapAt.on = true;
        window.clearTimeout(tapTimer);
        tapTimer = window.setTimeout(() => {
          tapAt.on = false;
          wake();
        }, TAP_HOLD);
        push(x, yy, 1);
        wake();
      },
      focus: (node) => {
        if (node) {
          placeFocus(node);
          focusAt.on = true;
          push(focusAt.x, focusAt.y, 0.45);
        } else {
          focusAt.on = false;
        }
        wake();
      },
      rebuild: () => {
        if (!layout()) return;
        restyle();
        aim();
        draw();
        wake();
      },
      restyle: () => {
        restyle();
        const p = params.current;
        const key = [p.topColor, p.sideColor, p.glowColor, p.shade].join("|");
        if (mode === "css" && key !== builtKey) buildCss();
        draw();
      },
      retheme: () => {
        // CSS cubes read their tokens live; only the canvas needs new paint.
        restyle();
        if (mode === "canvas") draw();
      },
      wake,
    };

    restyle();
    const sizer = new ResizeObserver(() => {
      if (w === root.clientWidth && h === root.clientHeight && n > 0) return;
      if (!layout()) return;
      aim();
      draw();
      wake();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (!inView) return;
      if (!introduced && params.current.intro && n > 0) {
        introduced = true;
        push(w / 2, h / 2, 0.55);
      }
      wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(tapTimer);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      clearFloor();
      api.current = null;
    };
  }, []);

  React.useEffect(() => {
    api.current?.rebuild();
  }, [pitch, renderer, dpr]);
  React.useEffect(() => {
    api.current?.restyle();
  }, [topColor, sideColor, glowColor, shade]);
  React.useEffect(() => {
    api.current?.wake();
  }, [rise, falloff, base, spring, glow, paused, motionSafe]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  // The server's frame: the flat floor as an isometric grout pattern, handed
  // over to the cubes as soon as they are built.
  const a = r2(pitch * HALF_W);
  const lineGap = r2((pitch * HALF_W) / Math.sqrt(1.25));
  const grout = "color-mix(in oklab, var(--foreground) 8%, transparent)";

  return (
    <div
      ref={rootRef}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        const at = local(event);
        api.current?.point(at.x, at.y);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        api.current?.leave();
      }}
      onPointerDown={(event) => {
        if (!interactive) return;
        if (event.pointerType === "touch") {
          touchStart.current = { x: event.clientX, y: event.clientY };
          return;
        }
        if (event.button !== 0) return;
        const at = local(event);
        api.current?.push(at.x, at.y, 1);
        if (wave > 0) onWave?.();
      }}
      onPointerUp={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || event.pointerType !== "touch") return;
        // A tap, not a scroll.
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
          return;
        }
        const at = local(event);
        api.current?.tap(at.x, at.y);
        if (wave > 0) onWave?.();
      }}
      onPointerCancel={() => {
        touchStart.current = null;
      }}
      onFocus={(event) => {
        if (!followFocus) return;
        const target = event.target as HTMLElement;
        if (!target.matches(":focus-visible")) return;
        api.current?.focus(target);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && rootRef.current?.contains(next)) return;
        api.current?.focus(null);
      }}
      className={cn("relative isolate overflow-clip", className)}
    >
      <span
        ref={placeholderRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
        style={{
          backgroundColor: topColor,
          backgroundImage: `repeating-linear-gradient(26.57deg, ${grout} 0 1px, transparent 1px ${lineGap}px), repeating-linear-gradient(153.43deg, ${grout} 0 1px, transparent 1px ${lineGap}px)`,
          backgroundPosition: `calc(50% + ${a}px) 50%`,
        }}
      />
      <div
        ref={floorRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none invisible absolute inset-0 -z-10 size-full"
      />
      {children}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.retheme()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
