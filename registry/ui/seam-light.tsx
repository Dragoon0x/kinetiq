"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SeamLightTrigger = "inView" | "mount" | "scroll" | "manual";

export type SeamLightProps = {
  /** The words standing in the light; each letter casts its own shaft. @default "Open after dark" */
  headline?: string;
  /** The headline's element. @default "h2" */
  as?: "h1" | "h2" | "h3" | "p";
  /** Content at the top of the frame — an eyebrow, a nav; it casts no shadow. */
  children?: React.ReactNode;
  /** How far the seam is open, 0 (a slit: crisp shadows fanned wide) to 1 (a broad glow: soft, stretched ones). @default 0.5 */
  aperture?: number;
  /** How thick the air is, 0 (clear: only the shafts) to 1 (smoky, the beam everywhere). @default 0.5 */
  haze?: number;
  /** The light's colour, 0 (cool white) to 1 (warm amber). @default 0.6 */
  warmth?: number;
  /** What opens the seam: coming into view, mounting, scrolling it up its scroll container, or `aperture` alone. @default "inView" */
  trigger?: SeamLightTrigger;
  /** Open once (true) or each time it comes back into view (false). @default true */
  once?: boolean;
  /** How bright the light burns, 0 to 1.5. @default 1 */
  intensity?: number;
  /** How far up the frame the light and the shadows reach, 0 to 1. @default 0.7 */
  reach?: number;
  /** How fast the haze drifts up through the beam, 0 (still) to 1. @default 0.5 */
  drift?: number;
  /** The pointer, and keyboard focus inside, slide the seam's light along the floor. @default true */
  interactive?: boolean;
  /** How far the light follows the hand, 0 to 1. @default 0.5 */
  pointerStrength?: number;
  /** The light's cool end; taken at a fixed lightness. @default "var(--accent-bright)" */
  coolColor?: string;
  /** The light's warm end; taken at a fixed lightness. @default "var(--warn)" */
  warmColor?: string;
  /** Hold the haze still; the seam still opens and follows the hand. @default false */
  paused?: boolean;
  /** Seeds the haze. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the seam has finished opening. */
  onOpen?: () => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
};

/** Soft light: half the capped pixel ratio, scaled up by the browser; the words stay crisp in the DOM. */
const RENDER_SCALE = 0.5;
const STEP = 1 / 240;
const CALM_FRAME = 31;
/** The seam as a slit: the share of the width it starts from. */
const SLIT = 0.015;
const OPEN_DELAY = 0.15;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

/** The light as a pigment at a fixed lightness: cool is nearly white, warm is amber. */
const coolOf = (c: string) => `oklch(from ${c} 0.9 calc(c * 0.35) h)`;
const warmOf = (c: string) => `oklch(from ${c} 0.82 c h)`;

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (
      /(auto|scroll|overlay)/.test(s.overflowY) &&
      el.scrollHeight > el.clientHeight
    )
      return el;
  }
  return null;
}

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_time;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_col;
uniform float u_floor;
uniform float u_seamX;
uniform float u_half;
uniform float u_haze;
uniform float u_intensity;
uniform float u_reach;
uniform vec4 u_box;
uniform float u_hasMask;
uniform vec2 u_seed;
uniform sampler2D u_mask;
in vec2 v_uv;
out vec4 outColor;

${GLSL_NOISE}

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

/** How much of the light from s reaches p past the words: march the mask only where the ray crosses their box. */
float through(vec2 p, vec2 s, float jitter, float lod) {
  if (u_hasMask < 0.5) return 1.0;
  vec2 d = p - s;
  vec2 inv = 1.0 / (abs(d) + 1e-4) * sign(d + 1e-6);
  vec2 t0 = (u_box.xy - s) * inv;
  vec2 t1 = (u_box.zw - s) * inv;
  vec2 lo = min(t0, t1);
  vec2 hi = max(t0, t1);
  float a = max(max(lo.x, lo.y), 0.0);
  float b = min(min(hi.x, hi.y), 1.0);
  if (b <= a) return 1.0;
  // A letter is a thin card: it holds most of the light back, never all of it.
  float block = 0.0;
  const int STEPS = 14;
  for (int i = 0; i < STEPS; i++) {
    float t = mix(a, b, (float(i) + jitter) / float(STEPS));
    block = max(block, textureLod(u_mask, (s + d * t) / u_size, lod).a);
  }
  return 1.0 - 0.9 * block;
}

void main() {
  vec2 p = v_uv * u_size;
  float w = u_size.x;
  float h = u_size.y;
  // Interleaved-gradient noise: a different jitter per pixel, so steps never band.
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  float above = u_floor - p.y;
  float light = 0.0;
  // The same light with nothing in its way: their ratio is the shadow.
  float open = 0.0;
  if (above > -1.0) {
    // Fixed points along the seam; a mask blurred in step with the seam's
    // width merges their shadows into one smooth penumbra.
    const int K = 6;
    float lod = mix(0.6, 3.2, clamp(u_half / (w * 0.22), 0.0, 1.0));
    for (int k = 0; k < K; k++) {
      float u = (float(k) + 0.5) / float(K) * 2.0 - 1.0;
      vec2 s = vec2(u_seamX + u * u_half, u_floor + 1.0);
      vec2 d = p - s;
      float dist = length(d) + 1.0;
      // The seam throws its light upward: brightest straight up, nothing along the floor.
      float up = clamp(-d.y / dist, 0.0, 1.0);
      float fall = 1.0 / (1.0 + dist / (h * (0.18 + 0.9 * u_reach)));
      float gain = sqrt(up) * fall;
      open += gain;
      light += gain * through(p, s, ign, lod);
    }
    light /= float(K);
    open /= float(K);
  }
  float shade = open > 1e-4 ? 1.0 - light / open : 0.0;
  // A wider seam gives more light, but not in proportion: the eye adapts.
  float strength = (0.55 + 0.75 * sqrt(u_half / w)) * u_intensity;
  light *= strength;
  open *= strength;

  // The haze: a slow fbm volume drifting up through the beam.
  vec2 q = p / vec2(260.0, 170.0) + u_seed + vec2(0.0, u_time * 0.05);
  float n = kx_fbm(q + vec2(kx_fbm(q * 0.7 - u_time * 0.02), 0.0));
  float scatter = mix(0.55, 0.1 + 1.6 * n * n, u_haze) * (0.6 + 0.8 * u_haze);
  float beam = light * scatter;

  // The seam itself and its bloom along the floor.
  float along = abs(p.x - u_seamX);
  float onSeam = smoothstep(u_half + 2.0, max(u_half - 2.0, 0.0), along);
  float line = exp(-pow((p.y - u_floor) / 1.4, 2.0)) * onSeam;
  float bloom = exp(-abs(p.y - u_floor) / (6.0 + 10.0 * u_haze)) * smoothstep(u_half + h * 0.3, u_half * 0.5, along) * 0.5;
  float hot = line * 2.0 + bloom * u_intensity;

  vec3 bg = lin(u_bg);
  vec3 fg = lin(u_fg);
  vec3 L = lin(u_col);
  vec3 col;
  if (u_light < 0.5) {
    vec3 ground = bg * mix(0.42, 0.7, v_uv.y);
    col = ground + L * (beam * 1.25 + hot) + vec3(1.0) * line * 0.6;
    col = 1.0 - exp(-col * 1.1);
  } else {
    // On a pale page the light paints the paper: warm cream shafts where it
    // gets past the words, the paper itself in their shadows, a little cooler
    // close behind them. Mixed in display space: near white, linear mixes
    // are too faint to see.
    vec3 paper = mix(u_bg, u_fg, 0.03 * (1.0 - v_uv.y));
    float lit = clamp(1.0 - exp(-(light * scatter * 4.5 + hot)), 0.0, 1.0);
    vec3 s = mix(paper, mix(u_bg, u_col, 0.75), lit * 0.85);
    float shadow = shade * smoothstep(0.0, 0.04, open * scatter) * exp(-max(above, 0.0) / (h * 0.5));
    s = mix(s, mix(u_bg, u_fg, 0.14), shadow * 0.35);
    s = mix(s, vec3(1.0), clamp(line * 0.9 + bloom * 0.2, 0.0, 1.0));
    col = lin(s);
  }
  // The floor below the seam is in its own shade.
  col *= mix(1.0, u_light > 0.5 ? 0.95 : 0.8, smoothstep(0.0, 3.0, -above));
  outColor = vec4(srgb(col), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  mask: WebGLTexture | null;
  lost: boolean;
};

type Config = {
  headline: string;
  colorKey: string;
  aperture: number;
  haze: number;
  warmth: number;
  trigger: SeamLightTrigger;
  once: boolean;
  intensity: number;
  reach: number;
  drift: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onOpen: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  remask: () => void;
  wake: () => void;
  seen: (inView: boolean) => void;
  scrolled: () => void;
  handTo: (x: number | null) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  words: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let failed = false;
  let light = 0;
  let opened = false;
  let openAt = 0;
  let reported = true;
  const read = rgbReader();
  const colours = new Float32Array(12);
  const colour = new Float32Array(3);
  const size = { w: 0, h: 0 };
  const sim = { t: 0 };
  const box = { x0: 0, y0: 0, x1: 0, y1: 0, has: false };
  const maskCanvas = document.createElement("canvas");
  /** The seam's opening (0–1 of the aperture's range) and its centre, px, each on the drift spring. */
  const open = { x: 0.5, v: 0, target: 0.5 };
  const centre = { x: Number.NaN, v: 0, target: 0 };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, mask: null, lost: false };
    return true;
  };

  const releaseGpu = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    if (g.mask) g.gl.deleteTexture(g.mask);
    g.tri.dispose();
    g.program.dispose();
  };

  /** The opening, 0–1, mapped to the seam's half-width in px. */
  const halfOf = (o: number) => {
    const c = cfg;
    const a = clamp(c?.aperture ?? 0.5, 0, 1);
    const share = SLIT + (0.42 - SLIT) * Math.pow(clamp(o, 0, 1.2) * a, 1.5);
    return Math.max(1, share * size.w);
  };

  /**
   * The words, drawn where the DOM laid them out: each word's own boxes,
   * the computed font, the same baseline. Only their alpha is used.
   */
  const remask = () => {
    const p = gpu;
    if (!p || p.lost || size.w < 1) return;
    const w = Math.max(1, Math.round(size.w));
    const h = Math.max(1, Math.round(size.h));
    maskCanvas.width = w;
    maskCanvas.height = h;
    const ctx = maskCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const style = getComputedStyle(words);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = style.letterSpacing;
    if ("letterSpacing" in ctx && spacing && spacing !== "normal") {
      (
        ctx as CanvasRenderingContext2D & { letterSpacing: string }
      ).letterSpacing = spacing;
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "white";
    const origin = root.getBoundingClientRect();
    const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    box.x0 = Infinity;
    box.y0 = Infinity;
    box.x1 = -Infinity;
    box.y1 = -Infinity;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const re = /\S+/g;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rects = range.getClientRects();
        const r = rects[0];
        if (!r) continue;
        const metrics = ctx.measureText(m[0]);
        const x = r.left - origin.left - root.clientLeft;
        const y =
          r.top - origin.top - root.clientTop + metrics.fontBoundingBoxAscent;
        ctx.fillText(m[0], x, y);
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, r.top - origin.top);
        box.x1 = Math.max(box.x1, x + r.width);
        box.y1 = Math.max(box.y1, r.bottom - origin.top);
      }
    }
    box.has = Number.isFinite(box.x0);
    const { gl } = p;
    p.mask = uploadTexture(gl, maskCanvas, { linear: true }, p.mask);
    // Mip levels are the mask blurred: the shader picks one by the seam's width.
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    statics();
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const k = clamp(c.warmth, 0, 1);
    for (let i = 0; i < 3; i += 1) {
      colour[i] =
        (colours[6 + i] ?? 0) +
        ((colours[9 + i] ?? 0) - (colours[6 + i] ?? 0)) * k;
    }
    p.program.set({
      u_size: [size.w, size.h],
      u_light: light,
      u_bg: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_fg: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_col: [colour[0] ?? 0, colour[1] ?? 0, colour[2] ?? 0],
      u_floor: size.h - Math.max(3, size.h * 0.03),
      u_haze: clamp(c.haze, 0, 1),
      u_intensity: clamp(c.intensity, 0, 1.5),
      u_reach: clamp(c.reach, 0, 1),
      u_box: [box.x0 - 2, box.y0 - 2, box.x1 + 2, box.y1 + 2],
      u_hasMask: box.has && p.mask ? 1 : 0,
      u_seed: [(c.seed * 3.7) % 11, (c.seed * 5.3) % 13],
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    if (Number.isNaN(centre.x)) centre.x = size.w / 2;
    if (p.mask) program.texture("u_mask", p.mask, 0);
    program.set({
      u_time: sim.t,
      u_seamX: centre.x,
      u_half: halfOf(open.x),
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** How far the frame has travelled up its scroll container, 0–1. */
  const fromScroll = () => {
    const r = root.getBoundingClientRect();
    const sc = scrollParent(root);
    const top = sc ? sc.getBoundingClientRect().top : 0;
    const vh = sc ? sc.clientHeight : window.innerHeight;
    const y = r.top - top;
    const end = vh * 0.35 - r.height / 2;
    return clamp((vh - y) / Math.max(1, vh - end), 0, 1);
  };

  const restTarget = (c: Config) => {
    if (c.trigger === "scroll") return fromScroll();
    if (!c.motionSafe) return 1;
    if (c.trigger === "manual") return 1;
    return opened ? 1 : 0;
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.drift > 0) {
      sim.t += dt * (0.3 + 1.7 * clamp(c.drift, 0, 1));
      moving = true;
    }
    if (openAt > 0) {
      openAt -= dt;
      if (openAt <= 0) {
        openAt = 0;
        open.target = 1;
      }
      moving = true;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const k = springs.drift;
    for (let i = 0; i < steps; i += 1) {
      for (const s of [open, centre]) {
        s.v +=
          ((k.stiffness * (s.target - s.x) - k.damping * s.v) / k.mass) * h;
        s.x += s.v * h;
      }
    }
    if (Math.abs(open.target - open.x) < 0.0005 && Math.abs(open.v) < 0.005) {
      open.x = open.target;
      open.v = 0;
      if (!reported && open.target >= 1) {
        reported = true;
        c.onOpen();
      }
    } else moving = true;
    if (Math.abs(centre.target - centre.x) < 0.1 && Math.abs(centre.v) < 1) {
      centre.x = centre.target;
      centre.v = 0;
    } else moving = true;
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const calm =
      open.v === 0 && centre.v === 0 && openAt === 0 && open.x === open.target;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the seam rests where it is asked to, and nothing travels. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    open.target = c.trigger === "scroll" ? fromScroll() : 1;
    open.x = open.target;
    open.v = 0;
    centre.x = centre.target;
    centre.v = 0;
    openAt = 0;
  };

  const crack = () => {
    const c = cfg;
    if (!c) return;
    opened = true;
    if (!c.motionSafe) {
      // Reduced motion: it is simply open, and says so.
      place();
      reported = true;
      c.onOpen();
      return;
    }
    // The seam cracks open: from a slit to the aperture on the drift spring.
    reported = false;
    open.x = 0;
    open.v = 0;
    open.target = 0;
    openAt = OPEN_DELAY;
    kick();
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
    // The words' ink follows the page the scene found itself on.
    root.setAttribute("data-tone", light ? "light" : "dark");
    statics();
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const first = size.w < 1;
    size.w = w;
    size.h = h;
    if (first || !c.interactive) {
      centre.target = w / 2;
      centre.x = w / 2;
    }
    resizeGL(p.gl, canvas, {
      dprCap: clamp(c.dpr, 0.5, 2),
      renderScale: RENDER_SCALE,
    });
    remask();
    draw();
    kick();
  };

  const startGpu = () => {
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
        // An opening that waits for a trigger starts as a slit.
        const waits =
          next.motionSafe &&
          (next.trigger === "inView" || next.trigger === "mount");
        open.x = waits ? 0 : 1;
        open.target = open.x;
        if (!startGpu()) {
          // No WebGL2: the CSS still stays, and nothing retries.
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
            if (!disposed) startGpu();
          },
        );
        if (next.trigger === "mount") crack();
        if (next.trigger === "scroll") {
          open.target = fromScroll();
          open.x = open.target;
        }
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.headline !== next.headline) {
        // The DOM has the new words by now; draw them once it has laid them out.
        window.requestAnimationFrame(() => {
          remask();
          draw();
        });
      }
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (was.trigger !== next.trigger || was.motionSafe !== next.motionSafe) {
        if (!next.motionSafe) place();
        else open.target = restTarget(next);
      }
      if (!next.interactive) centre.target = size.w / 2;
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    remask() {
      remask();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    seen(inView) {
      const c = cfg;
      if (!c || !gpu) return;
      if (inView) {
        if (c.trigger === "inView" && (!opened || !c.once)) crack();
        if (c.trigger === "scroll") open.target = fromScroll();
        draw();
        kick();
      } else if (c.trigger === "inView" && !c.once && opened && c.motionSafe) {
        // Out of view, a repeating seam closes to a slit for its next opening.
        opened = false;
        open.x = 0;
        open.target = 0;
        open.v = 0;
      }
    },
    scrolled() {
      const c = cfg;
      if (!c || c.trigger !== "scroll") return;
      open.target = fromScroll();
      if (!c.motionSafe) {
        open.x = open.target;
        draw();
        return;
      }
      // Scroll-tied: the seam is where the scroll says, no spring behind it.
      open.x = open.target;
      open.v = 0;
      draw();
    },
    handTo(x) {
      const c = cfg;
      if (!c) return;
      const mid = size.w / 2;
      centre.target =
        x === null || !c.interactive
          ? mid
          : mid + (x - mid) * clamp(c.pointerStrength, 0, 1);
      if (!c.motionSafe) {
        centre.x = centre.target;
        centre.v = 0;
        draw();
        return;
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      releaseGpu();
    },
  };
}

/**
 * A thin seam of light along the bottom of the frame throws its light up
 * through slow haze, and the headline standing in front of it casts long
 * shadow shafts up into the beam. The shadows are computed: every pixel
 * gathers light from points along the seam and marches toward each through
 * a mask of the words, drawn from the DOM's own word boxes and font — so a
 * slit throws crisp shadows fanned wide and a broad glow soft, stretched
 * ones. The first time it is seen the seam cracks open from a slit on the
 * drift spring; with `trigger="scroll"` its opening follows the scroll.
 * The pointer, or keyboard focus on a control inside, slides the light
 * along the floor so every shadow swings.
 *
 * The headline is real text, drawn as a backlit silhouette with a warm rim.
 * One fullscreen WebGL2 pass at half the capped pixel ratio, 30 frames a
 * second while the haze drifts, nothing off screen or hidden. Under reduced
 * motion the seam rests open and still; without WebGL2 a CSS still stands
 * in.
 */
export function SeamLight({
  headline = "Open after dark",
  as = "h2",
  children,
  aperture = 0.5,
  haze = 0.5,
  warmth = 0.6,
  trigger = "inView",
  once = true,
  intensity = 1,
  reach = 0.7,
  drift = 0.5,
  interactive = true,
  pointerStrength = 0.5,
  coolColor = "var(--accent-bright)",
  warmColor = "var(--warn)",
  paused = false,
  seed = 1,
  dpr = 2,
  onOpen,
  className,
}: SeamLightProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      coolOf(coolColor),
      warmOf(warmColor),
    ],
    [coolColor, warmColor],
  );
  const warmPct = Math.round(clamp(warmth, 0, 1) * 100);
  const lightCss = `color-mix(in oklab, ${warmOf(warmColor)} ${warmPct}%, ${coolOf(coolColor)})`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const wordsRef = React.useRef<HTMLElement | null>(null);
  const bindWords = React.useCallback((node: HTMLElement | null) => {
    wordsRef.current = node;
  }, []);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const reportOpen = React.useRef(onOpen);

  const config: Config = {
    headline,
    colorKey: paints.join("|"),
    aperture,
    haze,
    warmth,
    trigger,
    once,
    intensity,
    reach,
    drift,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onOpen: () => reportOpen.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportOpen.current = onOpen;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    const words = wordsRef.current;
    if (!root || !canvas || !carriers || !words) return;
    const e = createEngine(root, canvas, carriers, words, visible);
    engine.current = e;
    e.configure(latest.current);
    if (visible.current) e.seen(true);
    // A web font arriving moves the words: draw their shadows again.
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.remask();
    });
    const onScroll = () => engine.current?.scrolled();
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      live = false;
      window.removeEventListener("scroll", onScroll, { capture: true });
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
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        engine.current?.seen(visible.current);
      },
      { threshold: 0.2 },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    return clientX - root.getBoundingClientRect().left - root.clientLeft;
  };

  const Heading = as;

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" && event.buttons === 0) return;
        engine.current?.handTo(local(event.clientX));
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.handTo(null);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") engine.current?.handTo(null);
      }}
      onFocus={(event) => {
        const el = event.target;
        if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
        const r = el.getBoundingClientRect();
        engine.current?.handTo(local(r.left + r.width / 2));
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && rootRef.current?.contains(next)) return;
        engine.current?.handTo(null);
      }}
      className={cn(
        // A sideways finger slides the light on touch; an upright one scrolls.
        "group/seam-light @container relative isolate h-full w-full touch-pan-y overflow-clip",
        // Backlit words: near-black on a dark page, ink on a light one. Before the
        // scene has read its page, the colour scheme decides.
        "[--seam-ink:light-dark(var(--foreground),color-mix(in_oklab,var(--background)_45%,black))]",
        "data-[tone=dark]:[--seam-ink:color-mix(in_oklab,var(--background)_45%,black)] data-[tone=light]:[--seam-ink:var(--foreground)]",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/seam-light:opacity-0"
        style={standIn(lightCss, aperture)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      {children ? (
        <div className="absolute inset-x-0 top-0 flex justify-center p-4">
          {children}
        </div>
      ) : null}
      <div className="absolute inset-x-0 bottom-[16%] flex justify-center px-6">
        <Heading
          ref={bindWords}
          className="max-w-[18ch] text-center font-semibold tracking-tight text-balance"
          style={{
            fontSize: "clamp(1.5rem, 8cqw, 4.25rem)",
            lineHeight: 1,
            color: "var(--seam-ink)",
            textShadow: `0 0.025em 0 color-mix(in oklab, ${lightCss} 55%, transparent), 0 0 0.5em color-mix(in oklab, ${lightCss} 35%, transparent)`,
          }}
        >
          {headline}
        </Heading>
      </div>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the seam as a bright line on the floor and its
 * light rising as a soft fan, without the shadows.
 */
function standIn(light: string, aperture: number): React.CSSProperties {
  const spread = Math.round((20 + 40 * clamp(aperture, 0, 1)) * 10) / 10;
  return {
    backgroundColor:
      "light-dark(color-mix(in oklab, var(--background) 97%, var(--foreground)), color-mix(in oklab, var(--background) 55%, black))",
    backgroundImage: [
      `radial-gradient(${Math.round(spread * 8) / 10}% 1.6% at 50% 97%, color-mix(in oklab, ${light} 90%, white) 0, transparent 100%)`,
      `radial-gradient(${spread}% 85% at 50% 100%, color-mix(in oklab, ${light} 55%, transparent) 0, color-mix(in oklab, ${light} 18%, transparent) 55%, transparent 100%)`,
    ].join(", "),
  };
}
