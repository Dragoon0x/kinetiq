"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { cn } from "@/registry/lib/utils";

export type CausticTypeTint = "lagoon" | "glacier" | "peat" | "night";
export type CausticTypeElement = "p" | "div" | "h2" | "h3" | "blockquote";

export type CausticTypeProps = {
  /** The paragraph laid in the pool's floor. Real text: it wraps, selects and reads. */
  text: string;
  /** The element the text lives in. @default "p" */
  as?: CausticTypeElement;
  /** How deep the pool is, 0 to 1: deeper water focuses the light into finer nets, bends the words further and dims them. @default 0.5 */
  depth?: number;
  /** Strength of the light nets, 0 (still water) to 1 (a lively surface). @default 0.6 */
  caustics?: number;
  /** The water: its colour, the floor, the letter tiles and the light. @default "lagoon" */
  tint?: CausticTypeTint;
  /** Overrides the water colour, any CSS colour. @default the tint's */
  waterColor?: string;
  /** Overrides the colour of the caustic light. @default the tint's */
  lightColor?: string;
  /** Overrides the colour of the letter tiles. @default the tint's */
  inkColor?: string;
  /** Thin rainbow fringes along the light nets, 0 to 1. @default 0.35 */
  dispersion?: number;
  /** How fast the surface moves, 0.25 to 2. @default 1 */
  speed?: number;
  /** A faint grid of floor tiles under the words. @default true */
  tiles?: boolean;
  /** The pointer and the keyboard disturb the water. @default true */
  interactive?: boolean;
  /** How hard the pointer stirs, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the water still. @default false */
  paused?: boolean;
  /** Seed for the wave directions and phases. @default 1 */
  seed?: number;
  /** Device pixel ratio cap for the canvas. @default 2 */
  dpr?: number;
  /** Accessible name of the pool. @default "Pool" */
  label?: string;
  /** The water was disturbed (true) or has calmed again (false). */
  onStirChange?: (stirred: boolean) => void;
  className?: string;
};

type Water = { water: string; floor: string; ink: string; light: string };

/** Pigments, not tokens: a pool looks like water on any page. */
const TINTS: Record<CausticTypeTint, Water> = {
  lagoon: {
    water: "oklch(0.56 0.11 212)",
    floor: "oklch(0.89 0.035 196)",
    ink: "oklch(0.37 0.09 248)",
    light: "oklch(0.99 0.03 165)",
  },
  glacier: {
    water: "oklch(0.8 0.09 216)",
    floor: "oklch(0.96 0.02 210)",
    ink: "oklch(0.43 0.09 246)",
    light: "oklch(1 0.012 200)",
  },
  peat: {
    water: "oklch(0.5 0.1 64)",
    floor: "oklch(0.82 0.05 82)",
    ink: "oklch(0.33 0.06 42)",
    light: "oklch(0.98 0.06 95)",
  },
  night: {
    water: "oklch(0.34 0.09 268)",
    floor: "oklch(0.45 0.04 256)",
    ink: "oklch(0.9 0.035 240)",
    light: "oklch(0.94 0.05 222)",
  },
};

/** Waves on the surface. */
const WAVES = 9;
/** Disturbances the water remembers at once. */
const DROPS = 16;
/** A ring is gone after this long, s. */
const DROP_LIFE = 4;
/** How fast a ring spreads, em/s. */
const RING_SPEED = 3.1;
/** The keyboard fingertip's step, em. */
const STEP = 0.7;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A small seeded generator: the same surface for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x6a09e667) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FRAGMENT = `
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_text;
uniform vec2 u_size;
uniform float u_em;
uniform float u_time;
uniform float u_depth;
uniform float u_caustics;
uniform float u_disp;
uniform float u_tiles;
uniform float u_live;
uniform vec3 u_water;
uniform vec3 u_floor;
uniform vec3 u_ink;
uniform vec3 u_light;
uniform vec4 u_waves[${WAVES}];
uniform vec4 u_motion[${WAVES}];
uniform vec4 u_drops[${DROPS}];
uniform vec3 u_finger;

// Light gathered on the floor where the refraction map p -> p + D grad h
// squeezes area together: 1 / |det(I + D H)|.
float gather(vec3 H, float D) {
  float det = (1.0 + D * H.x) * (1.0 + D * H.y) - D * D * H.z * H.z;
  float i = 1.0 / max(abs(det), 0.035);
  return min(i, 14.0);
}

void main() {
  vec2 px = v_uv * u_size;
  vec2 q = px / u_em;
  vec2 g = vec2(0.0);
  vec3 H = vec3(0.0);
  for (int i = 0; i < ${WAVES}; i += 1) {
    vec4 w = u_waves[i];
    vec4 m = u_motion[i];
    float th = dot(w.xy, q) * w.z - m.y * u_time + w.w;
    float s = sin(th);
    float c = cos(th);
    g += m.x * w.z * c * w.xy;
    H -= m.x * w.z * w.z * s * vec3(w.x * w.x, w.y * w.y, w.x * w.y);
  }
  for (int j = 0; j < ${DROPS}; j += 1) {
    vec4 d = u_drops[j];
    if (d.w <= 0.0) continue;
    vec2 r = q - d.xy;
    float rl = length(r) + 0.0001;
    vec2 n = r / rl;
    float front = d.z * ${RING_SPEED.toFixed(2)};
    float width = 0.55 + 0.45 * d.z;
    float u = (rl - front) / width;
    float env = d.w * 0.05 * exp(-d.z * 0.85) * exp(-u * u) / (1.0 + rl * 0.3);
    float kd = 4.4;
    float ph = kd * (rl - front);
    float s = sin(ph);
    float c = cos(ph);
    g += env * kd * c * n;
    float A = -env * kd * kd * s;
    float B = env * kd * c / (rl + 0.5);
    H += vec3(
      A * n.x * n.x + B * (1.0 - n.x * n.x),
      A * n.y * n.y + B * (1.0 - n.y * n.y),
      (A - B) * n.x * n.y
    );
  }
  float D = mix(1.1, 4.2, u_depth);
  float spread = 0.06 * u_disp;
  vec3 I = vec3(gather(H, D * (1.0 - spread)), gather(H, D), gather(H, D * (1.0 + spread)));
  // Gathered light, compressed: a dim floor, bright filaments.
  vec3 net = pow(I, vec3(1.25)) / (1.0 + 0.22 * pow(I, vec3(1.25)));
  float strength = 0.25 + 0.75 * u_caustics;

  // The floor seen through the water: displaced by the surface slope.
  vec2 bend = -g * mix(0.14, 0.3, u_depth);
  vec2 fq = q + bend;
  vec2 tuv = (px + bend * u_em) / u_size;
  float letter = u_live > 0.5 ? texture(u_text, tuv).a : 0.0;
  vec3 floorCol = u_floor;
  if (u_tiles > 0.5) {
    vec2 cell = abs(fract(fq / 1.3) - 0.5) * 1.3;
    float grout = 1.0 - smoothstep(0.015, 0.05, min(cell.x, cell.y));
    floorCol *= 1.0 - 0.09 * grout;
  }
  vec3 albedo = mix(floorCol, u_ink, letter);
  vec3 E = 0.26 + strength * 0.5 * net;
  vec3 lit = albedo * E * u_light;

  // The water is a filter that deepens with depth, and scatters a little of
  // its own colour back.
  float top = max(max(u_water.r, u_water.g), max(u_water.b, 0.001));
  vec3 filt = mix(vec3(1.0), u_water / top, 0.3 + 0.35 * u_depth);
  vec3 col = lit * filt * (1.0 - 0.4 * u_depth) + u_water * (0.04 + 0.12 * u_depth);
  // Where the light gathers hardest it burns toward the light's own colour,
  // so the nets read pale at their cores rather than saturated.
  float burn = clamp((dot(col, vec3(0.2126, 0.7152, 0.0722)) - 0.62) * 1.6, 0.0, 0.75);
  col = mix(col, u_light, burn);

  // The walls shade the edges of the pool.
  vec2 edge = min(px, u_size - px) / u_em;
  float wall = smoothstep(0.0, 1.6, min(edge.x, edge.y));
  col *= mix(0.62, 1.0, wall);

  // Sparkle where the surface tilts toward the light.
  vec3 nrm = normalize(vec3(-g * 7.0, 1.0));
  vec3 l = normalize(vec3(-0.45, -0.55, 1.0));
  float spec = pow(max(dot(reflect(-l, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 220.0);
  col += u_light * spec * (0.05 + 0.12 * u_caustics);

  // The keyboard's fingertip, a faint ring on the surface.
  if (u_finger.z > 0.0) {
    float fr = length(q - u_finger.xy);
    float ring = exp(-pow((fr - 0.55) / 0.07, 2.0));
    col = mix(col, u_light, ring * 0.55 * u_finger.z);
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  texture: WebGLTexture | null;
  lost: boolean;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  draw: () => void;
  raster: () => void;
  colours: () => void;
  kick: () => void;
  tick: (now: number) => void;
};

/**
 * A paragraph laid in the floor of a clear pool. The words are real DOM text;
 * once a WebGL2 canvas is live they turn transparent and the canvas draws
 * them as dark tiles set in a pale plaster floor, seen through moving water. The light
 * is computed, not painted: the surface is seven seeded travelling waves plus
 * a ring for every disturbance, and the floor's brightness is how much the
 * refraction through that surface squeezes the light together — the inverse
 * of the Jacobian of `p → p + D∇h` — so it gathers into bright, wavering nets
 * that slide across the words, with a thin rainbow at their edges. The words
 * waver with the surface slope, deeper water dims and tints them, the walls
 * shade the edges and the odd sparkle glints off the surface.
 *
 * Move the pointer and the surface is disturbed: rings spread from its path
 * and sweep new nets across the paragraph; press and a pebble drops. Rest and
 * the rings fade until only the slow shimmer is left. The pool is a focusable
 * group: the arrow keys move a fingertip that stirs the water, Enter or Space
 * drops a pebble. The loop runs only on screen in a visible tab, at half rate
 * when the water is calm. Under reduced motion the pool is still — one frame
 * of light — and without WebGL2 a designed CSS pool shows the words.
 */
export function CausticType({
  text,
  as: Tag = "p",
  depth = 0.5,
  caustics = 0.6,
  tint = "lagoon",
  waterColor,
  lightColor,
  inkColor,
  dispersion = 0.35,
  speed = 1,
  tiles = true,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Pool",
  onStirChange,
  className,
}: CausticTypeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [live, setLive] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );

  const pool = TINTS[tint] ?? TINTS.lagoon;
  const water = waterColor ?? pool.water;
  const floor = waterColor
    ? `color-mix(in oklab, ${waterColor} 22%, white)`
    : pool.floor;
  const ink = inkColor ?? pool.ink;
  const light = lightColor ?? pool.light;

  const k = {
    depth: clamp01(depth),
    caustics: clamp01(caustics),
    dispersion: clamp01(dispersion),
    speed: clamp(speed, 0.25, 2),
    strength: clamp01(pointerStrength),
    dpr: clamp(dpr, 0.5, 2),
  };
  const running =
    live && onScreen && !hidden && !paused && motionSafe && k.speed > 0;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const textRef = React.useRef<HTMLElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriers = React.useRef<(HTMLSpanElement | null)[]>([]);
  const gpu = React.useRef<Gpu | null>(null);
  const sheet = React.useRef<HTMLCanvasElement | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const clock = React.useRef({ t: 0, last: 0, skip: false });
  const geo = React.useRef({ width: 1, height: 1, em: 16, cssEm: 16 });
  const uniforms = React.useRef({
    u_size: new Float32Array(2),
    u_em: 16,
    u_time: 0,
    u_depth: 0.5,
    u_caustics: 0.6,
    u_disp: 0.35,
    u_tiles: 1,
    u_live: 0,
    u_water: new Float32Array(3),
    u_floor: new Float32Array(3),
    u_ink: new Float32Array(3),
    u_light: new Float32Array(3),
    u_waves: new Float32Array(WAVES * 4),
    u_motion: new Float32Array(WAVES * 4),
    u_drops: new Float32Array(DROPS * 4),
    u_finger: new Float32Array(3),
  });
  /** Disturbances: x, y (em), birth (water time, s), strength. */
  const drops = React.useRef({
    list: new Float32Array(DROPS * 4),
    next: 0,
    last: { x: -99, y: -99, t: -99 },
    stirred: false,
  });
  const finger = React.useRef({ x: 0, y: 0, on: 0, placed: false });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onStirChange);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /**
   * The surface for this seed and strength, into the uniform arrays. The
   * waves share one band of wavelengths and fan across half the compass with
   * equal curvature, so their crossings knit into cells — a net — rather than
   * stripes that all lean one way.
   */
  const surface = () => {
    const u = uniforms.current;
    const rand = lcg(seed);
    const lively = 0.35 + 1.3 * k.caustics;
    const turn = rand() * Math.PI;
    for (let i = 0; i < WAVES; i += 1) {
      const angle = turn + (i / WAVES) * Math.PI + (rand() - 0.5) * 0.3;
      const lambda = 2.3 + 1.6 * rand();
      const wave = (Math.PI * 2) / lambda;
      const curve = (0.1 + 0.05 * rand()) * lively;
      u.u_waves[i * 4] = Math.cos(angle);
      u.u_waves[i * 4 + 1] = Math.sin(angle);
      u.u_waves[i * 4 + 2] = wave;
      u.u_waves[i * 4 + 3] = rand() * Math.PI * 2;
      u.u_motion[i * 4] = curve / (wave * wave);
      // Deep-water-like: longer waves travel a little faster, and half of
      // them run the other way, so the net churns instead of drifting.
      u.u_motion[i * 4 + 1] = (i % 2 ? -1 : 1) * 0.55 * Math.sqrt(wave);
    }
  };

  /** Any CSS colour as linear-ish sRGB floats, by painting one pixel. */
  const colours = () => {
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const u = uniforms.current;
    const slots = [u.u_water, u.u_floor, u.u_ink, u.u_light];
    slots.forEach((slot, i) => {
      const node = carriers.current[i];
      if (!node) return;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(node).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      slot[0] = (d[0] ?? 0) / 255;
      slot[1] = (d[1] ?? 0) / 255;
      slot[2] = (d[2] ?? 0) / 255;
    });
  };

  /**
   * The words into an alpha mask from their own layout: one Range rect per
   * word, so wrapping, alignment and the inherited font are the page's.
   */
  const raster = () => {
    const root = rootRef.current;
    const el = textRef.current;
    const canvas = canvasRef.current;
    const g = gpu.current;
    if (!root || !el || !canvas || !g || g.lost) return;
    const size = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    const style = getComputedStyle(el);
    const fontPx = parseFloat(style.fontSize) || 16;
    geo.current = {
      width: size.width,
      height: size.height,
      em: fontPx * size.dpr,
      cssEm: fontPx,
    };
    if (!sheet.current) sheet.current = document.createElement("canvas");
    const paper = sheet.current;
    paper.width = size.width;
    paper.height = size.height;
    const ctx = paper.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, paper.width, paper.height);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ("letterSpacing" in spaced) spaced.letterSpacing = style.letterSpacing;
    ctx.direction = style.direction === "rtl" ? "rtl" : "ltr";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "white";
    const metrics = ctx.measureText("Hg");
    const ascent = metrics.fontBoundingBoxAscent || fontPx * 0.8;
    const descent = metrics.fontBoundingBoxDescent || fontPx * 0.2;
    const box = root.getBoundingClientRect();
    const ox = box.left + root.clientLeft;
    const oy = box.top + root.clientTop;
    const node = el.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      const content = node.textContent ?? "";
      const rtl = ctx.direction === "rtl";
      const put = (word: string, r: DOMRect) => {
        const baseline = r.top + (r.height * ascent) / (ascent + descent);
        ctx.textAlign = rtl ? "right" : "left";
        ctx.fillText(word, (rtl ? r.right : r.left) - ox, baseline - oy);
      };
      for (const m of content.matchAll(/\S+/g)) {
        const start = m.index ?? 0;
        range.setStart(node, start);
        range.setEnd(node, start + m[0].length);
        const rects = range.getClientRects();
        const first = rects[0];
        if (rects.length === 1 && first) {
          put(m[0], first);
          continue;
        }
        // A word broken across lines: placed letter by letter instead.
        for (let i = 0; i < m[0].length; i += 1) {
          range.setStart(node, start + i);
          range.setEnd(node, start + i + 1);
          const r = range.getClientRects()[0];
          if (r) put(m[0].charAt(i), r);
        }
      }
      range.detach?.();
    }
    g.texture = uploadTexture(g.gl, paper, { linear: true }, g.texture);
  };

  /** One frame from the water as it stands. */
  const draw = () => {
    const g = gpu.current;
    if (!g || g.lost || !g.texture) return;
    const u = uniforms.current;
    const c = clock.current;
    const dr = drops.current;
    const f = finger.current;
    u.u_size[0] = geo.current.width;
    u.u_size[1] = geo.current.height;
    u.u_em = geo.current.em;
    u.u_time = c.t;
    u.u_depth = k.depth;
    u.u_caustics = k.caustics;
    u.u_disp = k.dispersion;
    u.u_tiles = tiles ? 1 : 0;
    u.u_live = 1;
    for (let i = 0; i < DROPS; i += 1) {
      const born = dr.list[i * 4 + 2] ?? 0;
      const s = dr.list[i * 4 + 3] ?? 0;
      const age = c.t - born;
      const alive = s > 0 && age >= 0 && age < DROP_LIFE;
      u.u_drops[i * 4] = dr.list[i * 4] ?? 0;
      u.u_drops[i * 4 + 1] = dr.list[i * 4 + 1] ?? 0;
      u.u_drops[i * 4 + 2] = alive ? age : 0;
      u.u_drops[i * 4 + 3] = alive ? s : 0;
    }
    u.u_finger[0] = f.x;
    u.u_finger[1] = f.y;
    u.u_finger[2] = f.on;
    g.program.use();
    g.program.texture("u_text", g.texture, 0);
    g.program.set(u);
    g.gl.viewport(0, 0, geo.current.width, geo.current.height);
    g.tri.draw();
  };

  const alive = () => {
    const dr = drops.current;
    const t = clock.current.t;
    for (let i = 0; i < DROPS; i += 1) {
      const s = dr.list[i * 4 + 3] ?? 0;
      if (s > 0 && t - (dr.list[i * 4 + 2] ?? 0) < DROP_LIFE) return true;
    }
    return false;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!running) return;
    const c = clock.current;
    const dt = c.last ? Math.min(0.05, (now - c.last) / 1000) : 0;
    c.last = now;
    c.t += dt * k.speed;
    const stirred = alive();
    const dr = drops.current;
    if (dr.stirred && !stirred) {
      dr.stirred = false;
      report.current?.(false);
    }
    // Calm water only shimmers: half the frames are enough.
    c.skip = !stirred && finger.current.on === 0 ? !c.skip : false;
    if (!c.skip) draw();
    if (!frame.current) frame.current = window.requestAnimationFrame(loop);
  };

  const kick = () => {
    if (frame.current || !running) return;
    clock.current.last = 0;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** A disturbance at (x, y) em. */
  const drop = (x: number, y: number, strength: number) => {
    if (!motionSafe || paused || strength <= 0) return;
    const dr = drops.current;
    const i = dr.next;
    dr.next = (dr.next + 1) % DROPS;
    dr.list[i * 4] = r3(x);
    dr.list[i * 4 + 1] = r3(y);
    dr.list[i * 4 + 2] = clock.current.t;
    dr.list[i * 4 + 3] = r3(strength);
    dr.last = { x, y, t: clock.current.t };
    if (!dr.stirred) {
      dr.stirred = true;
      report.current?.(true);
    }
    kick();
  };

  const local = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    const em = geo.current.cssEm || 16;
    return {
      x: (event.clientX - r.left - event.currentTarget.clientLeft) / em,
      y: (event.clientY - r.top - event.currentTarget.clientTop) / em,
    };
  };

  /** The pointer's path leaves rings behind it, stronger the faster it moves. */
  const stir = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const p = local(event);
    const dr = drops.current;
    const t = clock.current.t;
    const dist = Math.hypot(p.x - dr.last.x, p.y - dr.last.y);
    const dt = Math.max(0.016, t - dr.last.t);
    if (dist < 0.45 && dt < 0.12) return;
    if (dist < 0.08) return;
    const fast = clamp(dist / dt / 16, 0.15, 1);
    drop(p.x, p.y, k.strength * fast * 0.55);
  };

  const pebble = (x: number, y: number) =>
    drop(x, y, Math.max(0.2, k.strength) * 1.1);

  const placeFinger = () => {
    const f = finger.current;
    if (f.placed) return;
    const em = geo.current.cssEm || 16;
    const root = rootRef.current;
    f.x = root ? root.clientWidth / em / 2 : 4;
    f.y = root ? root.clientHeight / em / 2 : 2;
    f.placed = true;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const root = rootRef.current;
    if (!root) return;
    const em = geo.current.cssEm || 16;
    const f = finger.current;
    placeFinger();
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -STEP;
        break;
      case "ArrowRight":
        dx = STEP;
        break;
      case "ArrowUp":
        dy = -STEP;
        break;
      case "ArrowDown":
        dy = STEP;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!event.repeat) pebble(f.x, f.y);
        return;
      default:
        return;
    }
    event.preventDefault();
    f.x = clamp(f.x + dx, 0.5, root.clientWidth / em - 0.5);
    f.y = clamp(f.y + dy, 0.5, root.clientHeight / em - 0.5);
    f.on = 1;
    drop(f.x, f.y, k.strength * 0.5);
    api.current?.draw();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, raster, colours, kick, tick };
    report.current = onStirChange;
  });

  // The GPU side, bound to the canvas: built, rebuilt after a lost context,
  // torn down with the component. StrictMode's second build reuses the
  // context the browser hands back.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, texture: null, lost: false };
      api.current?.colours();
      api.current?.raster();
      api.current?.draw();
      return true;
    };
    const teardown = () => {
      const g = gpu.current;
      gpu.current = null;
      if (!g || g.lost) return;
      if (g.texture) g.gl.deleteTexture(g.texture);
      g.tri.dispose();
      g.program.dispose();
    };
    if (!build()) {
      setFallback(true);
      return;
    }
    setLive(true);
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        setLive(false);
      },
      () => {
        gpu.current = null;
        if (build()) setLive(true);
      },
    );
    return () => {
      detach();
      teardown();
      setLive(false);
    };
  }, []);

  // The surface for this seed and liveliness.
  React.useLayoutEffect(() => {
    surface();
    api.current?.draw();
    // `surface` reads only seed and caustics.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, k.caustics]);

  React.useLayoutEffect(() => {
    api.current?.raster();
    api.current?.draw();
  }, [text, k.dpr, live]);

  React.useEffect(() => {
    api.current?.colours();
    api.current?.draw();
  }, [water, floor, ink, light, live]);

  // Reduced motion and a held pool are one still frame at a fixed moment.
  React.useEffect(() => {
    if (!motionSafe) clock.current.t = 3.7 + (seed % 7) * 0.9;
    api.current?.draw();
    api.current?.kick();
  }, [running, motionSafe, seed, k.depth, k.caustics, k.dispersion, tiles]);

  React.useEffect(() => {
    const loopRef = frame;
    return () => {
      if (loopRef.current) window.cancelAnimationFrame(loopRef.current);
      loopRef.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.raster();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    const fonts = document.fonts;
    const refont = () => {
      api.current?.raster();
      api.current?.draw();
    };
    void fonts?.ready.then(refont);
    fonts?.addEventListener?.("loadingdone", refont);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      fonts?.removeEventListener?.("loadingdone", refont);
    };
  }, []);

  // A theme or colour change shows up as a carrier's 1ms colour transition.
  const onColour = () => {
    api.current?.colours();
    api.current?.draw();
  };

  const shown = live && !fallback;
  // The server's frame and the no-WebGL pool: the floor through the water,
  // with two soft pools of light.
  const seen = `color-mix(in oklab, ${floor} 30%, ${water})`;
  const still = `radial-gradient(46% 70% at 26% 34%, color-mix(in oklab, ${light} 30%, transparent), transparent 72%), radial-gradient(40% 64% at 76% 70%, color-mix(in oklab, ${light} 20%, transparent), transparent 72%), radial-gradient(120% 140% at 50% 45%, ${seen} 55%, color-mix(in oklab, ${water} 70%, black))`;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="pool"
      aria-label={label}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-live={shown ? "" : undefined}
      data-fallback={fallback ? "" : undefined}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" && event.buttons === 0) return;
        stir(event);
      }}
      onPointerDown={(event) => {
        if (!interactive) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const p = local(event);
        pebble(p.x, p.y);
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          placeFinger();
          finger.current.on = 1;
          api.current?.draw();
        }
      }}
      onBlur={() => {
        finger.current.on = 0;
        api.current?.draw();
      }}
      onKeyDown={onKeyDown}
      className={cn(
        "relative isolate block touch-pan-y overflow-hidden rounded-3 px-[1.4em] py-[1.1em]",
        "shadow-[inset_0_0_0_1px_color-mix(in_oklab,black_22%,transparent)]",
        interactive &&
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ background: still }}
    >
      <Tag
        ref={textRef as React.Ref<never>}
        className={cn(
          "relative z-0 m-0",
          shown && "text-transparent selection:bg-black/15",
        )}
        style={
          shown
            ? undefined
            : {
                color: `color-mix(in oklab, ${ink} 82%, ${water})`,
              }
        }
      >
        {text}
      </Tag>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 size-full",
          !shown && "invisible",
        )}
      />
      {[water, floor, ink, light].map((c, i) => (
        <span
          key={i}
          ref={(node) => {
            carriers.current[i] = node;
          }}
          aria-hidden
          onTransitionEnd={onColour}
          className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
          style={{ color: c }}
        />
      ))}
      {interactive ? (
        <span id={hintId} className="sr-only">
          Arrow keys stir the water; Enter drops a pebble.
        </span>
      ) : null}
    </div>
  );
}
