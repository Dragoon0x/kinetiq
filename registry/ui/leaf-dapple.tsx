"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { cn } from "@/registry/lib/utils";

export type LeafDappleProps = {
  /** The content on the wall: a hero line, a heading, a call to action. It stays fully interactive. */
  children?: React.ReactNode;
  /** The breeze, 0 (a still afternoon) to 1 (a gusty one): how far and how fast the leaves sway. @default 0.4 */
  wind?: number;
  /** How thick the canopy is, 0 (sparse, the wall mostly lit) to 1 (dense, a few bright coins in deep shade). @default 0.55 */
  leafDensity?: number;
  /** How much of the sun the moon covers, 0 to 1; every dapple becomes a crescent, and at 1 a ring. @default 0 */
  eclipse?: number;
  /** A typical dapple's diameter, px (10 to 60): how high the canopy is. @default 26 */
  sunSize?: number;
  /** The sun's height above the horizon, degrees (0 to 75); a high sun grazes the wall and stretches every dapple. @default 45 */
  elevation?: number;
  /** Which way the stretched dapples lean, degrees from vertical. @default 25 */
  azimuth?: number;
  /** How golden the light is, 0 (white noon) to 1 (late afternoon). @default 0.5 */
  warmth?: number;
  /** How much trowel texture and grain the plaster shows, 0 to 1. @default 0.5 */
  plaster?: number;
  /** The plaster, any CSS colour. @default the page warmed a little toward amber */
  wallColor?: string;
  /** The sunlight, any CSS colour. @default a warm white from the amber token */
  sunColor?: string;
  /** The shade, any CSS colour: the wall under the canopy's cool skylight. @default a cool tint from the accent token */
  shadeColor?: string;
  /** The pointer is a gust that stirs the leaves near it. @default true */
  interactive?: boolean;
  /** How strong a pointer gust is, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the leaves still. @default false */
  paused?: boolean;
  /** Seeds where the gaps in the canopy fall. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the wall. @default "h-full w-full" */
  className?: string;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_time;
uniform float u_cell;
uniform float u_size;
uniform float u_density;
uniform float u_eclipse;
uniform float u_elong;
uniform vec2 u_axis;
uniform float u_wind;
uniform vec4 u_gust[4];
uniform vec3 u_wall;
uniform vec3 u_sun;
uniform vec3 u_shade;
uniform float u_warmth;
uniform float u_plaster;
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

float h1(vec2 p, float k) { return kx_hash(p * (1.0 + k * 0.137) + vec2(u_seed * 7.13 + k * 13.7, u_seed * 3.71 - k * 5.3)); }

void main() {
  vec2 p = v_uv * u_res;

  // Gusts: soft discs of stirred air left along the pointer's path.
  float gust = 0.0;
  for (int i = 0; i < 4; i += 1) {
    vec4 g = u_gust[i];
    vec2 d = p - g.xy;
    gust += g.z * exp(-dot(d, d) / max(1.0, g.w * g.w));
  }
  gust = min(gust, 1.6);

  float amp = u_wind + gust * 0.9;
  vec2 cell = floor(p / u_cell);
  vec2 axisB = vec2(-u_axis.y, u_axis.x);
  // The moon slides in from one side of every image at once — the same
  // side for all of them, because each dapple is the same inverted sun.
  vec2 moonDir = normalize(vec2(0.62, -0.78));
  float light = 0.0;

  for (int oy = -1; oy <= 1; oy += 1) {
    for (int ox = -1; ox <= 1; ox += 1) {
      vec2 id = cell + vec2(float(ox), float(oy));
      // Foliage thins in patches: gaps cluster where the canopy is open.
      float patchy = kx_noise(id * 0.23 + u_seed * 1.7);
      if (h1(id, 1.0) < u_density * 0.9 + (0.5 - patchy) * 0.85) continue;
      vec2 home = (id + 0.15 + 0.7 * vec2(h1(id, 2.0), h1(id, 3.0))) * u_cell;
      // Canopy height: a high gap throws a big soft image, a near one a small sharp one.
      float height = h1(id, 4.0);
      float R = u_size * 0.5 * mix(0.55, 1.35, height);
      // Branches sway together (noise over neighbourhoods), leaves flutter alone.
      vec2 branch = home / (u_cell * 3.5);
      vec2 sway = vec2(
        kx_noise(branch + vec2(u_time * 0.31, 1.7)) - 0.5,
        kx_noise(branch + vec2(4.3, u_time * 0.27)) - 0.5
      ) * u_cell * 0.7 * amp;
      float ph = h1(id, 5.0) * 6.2831;
      sway += vec2(sin(u_time * 2.9 + ph), cos(u_time * 2.3 + ph * 1.3)) * (1.2 + 2.6 * gust) * amp;
      vec2 c = home + sway;
      // A leaf drifting over the gap closes it for a moment.
      float flick = kx_noise(vec2(u_time * (0.9 + gust * 2.0) + ph * 3.0, height * 9.0));
      float open = mix(1.0, smoothstep(0.08, 0.5, flick), clamp(0.12 + amp * 0.55, 0.0, 1.0));
      float bright = mix(1.35, 0.85, height) * mix(0.7, 1.0, h1(id, 6.0)) * open;

      vec2 d = p - c;
      vec2 q = vec2(dot(d, axisB), dot(d, u_axis) / u_elong);
      float r = length(q);
      if (r > R * 1.6) continue;
      float soft = R * mix(0.05, 0.2, h1(id, 7.0));
      float disc = 1.0 - smoothstep(R - soft, R + soft, r);
      // Limb darkening: the sun's own disc is dimmer toward its edge.
      disc *= 1.0 - 0.22 * clamp(r / R, 0.0, 1.0) * clamp(r / R, 0.0, 1.0);
      float Rm = R * 0.88;
      vec2 off = moonDir * (1.0 - u_eclipse) * (R + Rm + soft);
      float moon = 1.0 - smoothstep(Rm - soft, Rm + soft, length(q - off));
      disc *= 1.0 - moon * step(0.001, u_eclipse);
      light += disc * bright;
    }
  }

  float L = 1.0 - exp(-light * 2.6);
  // The canopy is thicker in places: broad, soft masses of deeper shade.
  float mass = kx_noise(p / 210.0 + u_seed * 0.37 + vec2(u_time * 0.02, 0.0)) * 0.65
    + kx_noise(p / 90.0 - u_seed * 0.21) * 0.35;
  vec3 shade = mix(u_wall, u_shade, 0.62) * mix(1.05, 0.9, u_density) * mix(0.86, 1.06, mass);
  float lum = dot(u_sun, vec3(0.2126, 0.7152, 0.0722));
  vec3 sun = mix(vec3(lum), u_sun, 0.3 + 0.7 * u_warmth);
  sun = mix(u_wall, sun, 0.92);
  vec3 col = mix(shade, sun, L);

  // Plaster: trowel marks and grain, showing most where the light rakes it.
  float trowel = kx_noise(p / vec2(96.0, 34.0) + u_seed) * 0.6 + kx_noise(p / 21.0 - u_seed) * 0.4;
  float grain = kx_hash(floor(p) + u_seed) - 0.5;
  float tex = 1.0 + (trowel - 0.5) * 0.1 * u_plaster + grain * 0.04 * u_plaster;
  col *= mix(1.0, tex, 0.55 + 0.45 * L);
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** A dense screen can drop a quarter of its pixels: dapples are soft. */
const RENDER_SCALE = 0.75;
const CALM_FRAME = 31;
/** How long a gust lingers, s (the drift spring's time scale, twice over). */
const GUST_LIFE = 1.6;

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

type Config = {
  colorKey: string;
  wind: number;
  leafDensity: number;
  eclipse: number;
  sunSize: number;
  elevation: number;
  azimuth: number;
  warmth: number;
  plaster: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  stir: (x: number, y: number, speed: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let phase = 0;
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  const colours = new Float32Array(9);
  // Gust slots: x, y, strength, radius — the newest replaces the oldest.
  const gusts = new Float32Array(16);
  const born = new Float32Array(4);
  const peak = new Float32Array(4);
  let slot = 0;
  let lastGustAt = -1;
  let clock = 0;

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, lost: false };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    // On a wall the light arrives at the sun's height from the wall's
    // normal: a high sun grazes it and stretches every image by 1 / cos.
    const elev = (clamp(c.elevation, 0, 75) * Math.PI) / 180;
    const az = (c.azimuth * Math.PI) / 180;
    const size2 = clamp(c.sunSize, 10, 60);
    p.program.set({
      u_res: [size.w, size.h],
      u_cell: size2 * 1.25,
      u_size: size2,
      u_density: clamp(c.leafDensity, 0, 1),
      u_eclipse: clamp(c.eclipse, 0, 1),
      u_elong: 1 / Math.cos(elev),
      u_axis: [Math.sin(az), Math.cos(az)],
      u_wind: clamp(c.wind, 0, 1),
      u_wall: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_sun: [colours[3] ?? 1, colours[4] ?? 1, colours[5] ?? 1],
      u_shade: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0],
      u_warmth: clamp(c.warmth, 0, 1),
      u_plaster: clamp(c.plaster, 0, 1),
      u_seed: (Math.round(c.seed) % 97) + 0.5,
    });
  };

  const gustLevel = () => {
    let any = false;
    for (let i = 0; i < 4; i += 1) {
      const age = clock - (born[i] ?? 0);
      // Eases out like the drift spring settling: e^(−t/τ).
      const k = (peak[i] ?? 0) * Math.exp(-age / (GUST_LIFE / 3));
      gusts[i * 4 + 2] = k > 0.01 ? k : 0;
      if (k > 0.01) any = true;
    }
    return any;
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    p.program.set({ u_time: r3(phase), u_gust: gusts });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const moving = () => {
    const c = cfg;
    if (!c || !c.motionSafe || c.paused) return false;
    return c.wind > 0 || gustLevel();
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || !gpu) {
      last = 0;
      return;
    }
    const gusting = gustLevel();
    // Only the breeze moving: thirty frames a second is plenty for leaves.
    if (!gusting && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    clock += dt;
    if (c.motionSafe && !c.paused)
      phase += dt * (0.25 + 1.6 * clamp(c.wind, 0, 1));
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    if (!moving()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 3; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(p.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? RENDER_SCALE : 1,
    });
    statics();
    draw();
    kick();
  };

  const start = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!start()) {
          // No WebGL2: the drawn still stays, and nothing retries.
          failed = true;
          root.setAttribute("data-fallback", "");
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            root.removeAttribute("data-live");
          },
          () => {
            gpu = null;
            if (!disposed && start()) kick();
          },
        );
        kick();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!next.motionSafe && was.motionSafe) phase = 0;
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    stir(x, y, speed) {
      const c = cfg;
      if (!c || !c.interactive || !c.motionSafe || c.paused) return;
      const strength =
        clamp(speed / 1400, 0, 1) * clamp(c.pointerStrength, 0, 1) * 1.4;
      if (strength < 0.02) return;
      // A sweep leaves a trail: a new gust every 70 ms, the newest replacing the oldest.
      let i = (slot + 3) % 4;
      if (clock - lastGustAt > 0.07) {
        i = slot;
        slot = (slot + 1) % 4;
        lastGustAt = clock;
        peak[i] = 0;
      }
      gusts[i * 4] = x;
      gusts[i * 4 + 1] = y;
      gusts[i * 4 + 3] = 90 + clamp(c.sunSize, 10, 60) * 2.4;
      // Strength builds toward the live level, never jumps past it.
      const current =
        (peak[i] ?? 0) * Math.exp(-(clock - (born[i] ?? 0)) / (GUST_LIFE / 3));
      peak[i] = Math.min(1.4, Math.max(current, strength) + strength * 0.25);
      born[i] = clock;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

/** Seeded soft dapples for the server, for the first paint, and for browsers without WebGL2. */
function standIn(seed: number, density: number, sunSize: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  // Gaps cluster where the canopy is thin: a few patches, dapples round them.
  const patches = Array.from({ length: 4 }, () => [rand() * 100, rand() * 100]);
  const count = Math.round(52 - 36 * clamp(density, 0, 1));
  const out: { x: number; y: number; r: number; o: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const [px = 50, py = 50] = patches[i % patches.length] ?? [];
    const near = rand() < 0.6;
    out.push({
      x: r3(near ? px + (rand() - 0.5) * 34 : rand() * 100),
      y: r3(near ? py + (rand() - 0.5) * 60 : rand() * 100),
      r: r3((clamp(sunSize, 10, 60) / 2) * (0.55 + rand() * 0.8)),
      o: r3(0.55 + rand() * 0.45),
    });
  }
  return out;
}

/**
 * A plaster wall in the afternoon, dappled with sunlight through a swaying
 * canopy, as a background with your content above it. Every dapple is a
 * true pinhole image of the sun — round, soft-edged, sized by how high its
 * gap is in the canopy, stretched by a low sun — so setting `eclipse` turns
 * every one of them into a crescent at once, all cut from the same side, and
 * at 1 into rings. Branches sway together and leaves flutter alone, closing
 * their gaps for a moment as they pass; the pointer is a gust that stirs the
 * leaves along its path, the stir easing out over a second and a half.
 *
 * One WebGL2 pass, a 3×3 neighbourhood of a jittered lattice per pixel,
 * drawn at three quarters of a dense screen's pixels. Under reduced motion a
 * still afternoon: one frame, redrawn only when a prop changes. Without
 * WebGL2 a drawn still of soft dapples stays.
 */
export function LeafDapple({
  children,
  wind = 0.4,
  leafDensity = 0.55,
  eclipse = 0,
  sunSize = 26,
  elevation = 45,
  azimuth = 25,
  warmth = 0.5,
  plaster = 0.5,
  wallColor = "color-mix(in oklab, var(--background) 90%, var(--warn))",
  sunColor = "light-dark(oklch(from var(--warn) 0.99 0.045 h), oklch(from var(--warn) 0.8 0.1 h))",
  shadeColor = "light-dark(oklch(from var(--warn) 0.7 0.035 calc(h + 30)), oklch(from var(--accent-bright) 0.15 0.02 calc(h - 70)))",
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  className,
}: LeafDappleProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const lastMove = React.useRef({ x: 0, y: 0, t: 0 });

  const config: Config = {
    colorKey: `${wallColor}|${sunColor}|${shadeColor}`,
    wind,
    leafDensity,
    eclipse,
    sunSize,
    elevation,
    azimuth,
    warmth,
    plaster,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
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

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root || !interactive) return;
    const r = root.getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    const prev = lastMove.current;
    const dt = Math.max(8, event.timeStamp - prev.t);
    const speed = prev.t ? (Math.hypot(x - prev.x, y - prev.y) / dt) * 1000 : 0;
    lastMove.current = { x, y, t: event.timeStamp };
    engine.current?.stir(x, y, Math.min(speed, 4000));
  };

  // Focus moving to something on the wall sends a small gust from it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const root = rootRef.current;
    if (!root || !interactive) return;
    const target = event.target as Element;
    const r = root.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    engine.current?.stir(
      t.left + t.width / 2 - r.left,
      t.top + t.height / 2 - r.top,
      900,
    );
  };

  const dapples = React.useMemo(
    () => standIn(seed, leafDensity, sunSize),
    [seed, leafDensity, sunSize],
  );
  const e = clamp(eclipse, 0, 1);
  // The still's moon, cut from every dapple's own box the way the shader cuts it.
  const moon =
    e > 0.001
      ? `radial-gradient(44% 44% at ${r3(50 - 62 * (1 - e) * 0.94)}% ${r3(50 - 78 * (1 - e) * 0.94)}%, transparent 96%, black 100%)`
      : undefined;
  const stretch = r3(1 / Math.cos((clamp(elevation, 0, 75) * Math.PI) / 180));

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerLeave={() => {
        lastMove.current = { x: 0, y: 0, t: 0 };
      }}
      onFocus={onFocus}
      className={cn(
        "group/leaf-dapple relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip group-data-live/leaf-dapple:hidden"
        style={{
          background: `color-mix(in oklab, ${wallColor} 38%, ${shadeColor})`,
        }}
      >
        {dapples.map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: r3(d.r * 2),
              height: r3(d.r * 2),
              margin: r3(-d.r),
              opacity: d.o,
              background: `radial-gradient(closest-side, ${sunColor} 0%, ${sunColor} 70%, transparent 100%)`,
              transform: `rotate(${r3(-azimuth)}deg) scaleY(${stretch})`,
              maskImage: moon,
            }}
          />
        ))}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/leaf-dapple:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[wallColor, sunColor, shadeColor].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}
