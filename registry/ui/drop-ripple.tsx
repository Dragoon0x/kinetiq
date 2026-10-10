"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  bindScreen,
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type Framebuffer,
  type PingPong,
} from "@/registry/lib/glsl";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type DropRippleProps = {
  /** An image to put under the water; without one, the water lies over generated pool tiles. */
  src?: string;
  /** What the picture under the water shows, for assistive technology. @default "Water over pool tiles" */
  alt?: string;
  /** Content laid over the water (a headline). It takes no pointer events, so drops land through it; give a control `pointer-events-auto`. */
  children?: React.ReactNode;
  /** How quickly the rings die away, 0 (long-lived, many reflections) to 1 (a quick settle). @default 0.4 */
  damping?: number;
  /** A drop's radius, in CSS pixels. @default 16 */
  size?: number;
  /** Seeded rain falling on the surface, 0 (none) to 1 (about eight drops a second on a wide card). @default 0 */
  rain?: number;
  /** How deep a drop dents the surface, 0 to 1. @default 0.6 */
  strength?: number;
  /** How far the water bends the picture under it, 0 to 1. @default 0.5 */
  refraction?: number;
  /** The soft highlight on the crests, 0 to 1. @default 0.5 */
  specular?: number;
  /** The faint wake a mouse leaves as it moves over the water, 0 (none) to 1. @default 0.25 */
  wake?: number;
  /** The generated tiles' colours: deep water, shallow water and the grout and lane line, as CSS colours resolved on the element. @default pigments from the accent and signal tokens */
  colors?: [string, string, string];
  /** The generated tiles' size, in CSS pixels. @default 28 */
  tile?: number;
  /** The simulation's resolution as a share of the box, 0.25 to 1. @default 0.5 */
  resolution?: number;
  /** Presses, drags, the mouse and the keyboard disturb the water. @default true */
  interactive?: boolean;
  /** The surface's accessible name. @default "Water surface" */
  label?: string;
  /** Seed for the tiles' tones and the rain. @default 9 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Freeze the water where it is. @default false */
  paused?: boolean;
  /** Play a plip for each drop the visitor makes (never for rain). Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when the visitor drops into the water, with the point as fractions of the box. */
  onDrop?: (x: number, y: number) => void;
  /** Classes for the box; set its height here. @default "h-56" */
  className?: string;
};

const DEFAULT_COLORS: [string, string, string] = [
  "color-mix(in oklab, var(--accent) 62%, var(--background))",
  "color-mix(in oklab, var(--signal) 46%, var(--background))",
  "color-mix(in oklab, var(--accent) 40%, var(--foreground))",
];

const MAX_DROPS = 8;
const STEP = 1 / 120;

const SIM = /* glsl */ `
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_damp;
uniform bool u_byte;
uniform vec4 u_drops[${MAX_DROPS}];
uniform int u_count;
out vec4 o_color;

const float RANGE = 2.0;
float dec(float v) { return u_byte ? (v * 2.0 - 1.0) * RANGE : v; }
float enc(float v) {
  float c = clamp(v, -RANGE, RANGE);
  return u_byte ? c / RANGE * 0.5 + 0.5 : c;
}

void main() {
  // The state lives in texture space (y up); reads clamp at the edges, so
  // the rings reflect off the sides instead of leaving.
  vec2 st = gl_FragCoord.xy * u_texel;
  vec4 here = texture(u_state, st);
  float h = dec(here.r);
  float prev = dec(here.g);
  float n = dec(texture(u_state, st + vec2(0.0, u_texel.y)).r);
  float s = dec(texture(u_state, st - vec2(0.0, u_texel.y)).r);
  float e = dec(texture(u_state, st + vec2(u_texel.x, 0.0)).r);
  float w = dec(texture(u_state, st - vec2(u_texel.x, 0.0)).r);
  float next = ((n + s + e + w) * 0.5 - prev) * u_damp;
  for (int i = 0; i < ${MAX_DROPS}; i += 1) {
    if (i >= u_count) break;
    vec4 d = u_drops[i];
    float dist = length(gl_FragCoord.xy - d.xy) / max(d.z, 0.5);
    if (dist < 1.0) next -= d.w * (0.5 + 0.5 * cos(dist * 3.14159265));
  }
  o_color = vec4(enc(next), enc(h), 0.0, 1.0);
}
`;

const RENDER = /* glsl */ `
uniform sampler2D u_state;
uniform sampler2D u_image;
uniform vec2 u_texel;
uniform bool u_byte;
uniform bool u_live;
uniform bool u_photo;
uniform vec4 u_cover;
uniform vec2 u_res;
uniform float u_tile;
uniform vec3 u_deep;
uniform vec3 u_shallow;
uniform vec3 u_line;
uniform vec3 u_glint;
uniform float u_refract;
uniform float u_spec;
uniform float u_seed;
uniform vec4 u_still;
in vec2 v_uv;
out vec4 o_color;

const float RANGE = 2.0;
float dec(float v) { return u_byte ? (v * 2.0 - 1.0) * RANGE : v; }

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 17.17) * 43758.5453);
}

// The water's height in CSS pixels' terms: the live field, or under reduced
// motion one still set of rings around a drop.
float height(vec2 uv) {
  if (u_live) return dec(texture(u_state, vec2(uv.x, 1.0 - uv.y)).r);
  float r = length((uv - u_still.xy) * u_res);
  return u_still.w * sin(r * 0.32) * exp(-r / 60.0) * smoothstep(0.0, 6.0, r);
}

vec3 tiles(vec2 uv) {
  vec2 p = uv * u_res;
  float size = max(u_tile, 6.0);
  vec2 cell = floor(p / size);
  vec2 f = fract(p / size);
  vec2 cols = floor(u_res / size);
  // Deeper toward the top; each tile a touch apart from its neighbours.
  float depth = 1.0 - uv.y * 0.75;
  vec3 tone = mix(u_shallow, u_deep, clamp(depth + (hash(cell) - 0.5) * 0.16, 0.0, 1.0));
  // A lane line across the deep end, with T-ends, clear of any overlay
  // that sits low in the box.
  float lane = max(1.0, floor(cols.y * 0.3));
  float a = 2.0;
  float b = cols.x - 3.0;
  bool line = (cell.y == lane && cell.x >= a && cell.x <= b)
    || ((cell.x == a || cell.x == b) && abs(cell.y - lane) <= 1.0);
  if (line) tone = mix(tone, u_line, 0.5);
  float gw = 1.1 / size;
  float grout = max(1.0 - smoothstep(0.0, gw, min(f.x, f.y)), smoothstep(1.0 - gw, 1.0, max(f.x, f.y)));
  return mix(tone, mix(tone, u_line, 0.4), grout);
}

vec3 picture(vec2 uv) {
  if (!u_photo) return tiles(uv);
  return texture(u_image, clamp(uv * u_cover.xy + u_cover.zw, 0.0, 1.0)).rgb;
}

void main() {
  vec2 dx = u_live ? u_texel : 1.0 / u_res;
  float h = height(v_uv);
  float hl = height(v_uv - vec2(dx.x, 0.0));
  float hr = height(v_uv + vec2(dx.x, 0.0));
  float hu = height(v_uv - vec2(0.0, dx.y));
  float hd = height(v_uv + vec2(0.0, dx.y));
  // Slopes in the page's orientation (y down), then a normal.
  vec2 slope = vec2(hr - hl, hd - hu) * 3.0;
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 col = picture(v_uv + n.xy * u_refract * 0.05);
  // Light from the upper left: a shade across the slope, a soft highlight
  // on the crests, and a faint caustic where the surface converges.
  vec3 L = normalize(vec3(-0.45, -0.55, 0.7));
  col *= 1.0 + (dot(n, L) - L.z) * 0.9;
  vec3 R = reflect(-L, n);
  col += u_glint * pow(max(R.z, 0.0), 80.0) * u_spec * 0.9;
  float lap = hl + hr + hu + hd - 4.0 * h;
  col += u_glint * clamp(lap * 0.8, 0.0, 0.18) * u_spec;
  o_color = vec4(col, 1.0);
}
`;

type Rgb = [number, number, number];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Clears a state buffer to still water: zero, or mid-grey in byte mode. */
function still(gl: WebGL2RenderingContext, fb: Framebuffer) {
  fb.bind();
  if (fb.precision === "byte") gl.clearColor(0.5, 0.5, 0, 1);
  else gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/**
 * Water over a picture, simulated on the GPU. The surface is a height field
 * on a ping-pong pair of framebuffers (half-float where it can render to it,
 * byte-encoded where it cannot): each fixed step takes the neighbours'
 * average less the previous height and damps it, and reads clamp at the
 * edges, so a ring meets the sides and comes back crossed with its own
 * reflection before it smooths to glass. A press drops a cosine dimple, a drag
 * leaves a wake of shallow ones, a passing mouse a faint trail, and `rain`
 * lets seeded drops fall. The picture — generated pool tiles, or `src` — is
 * refracted through the surface normals, shaded across the slopes and
 * caught by a soft highlight on the crests.
 *
 * The surface is a button: Enter or Space drops at a marker that the arrow
 * keys move. The loop runs only while there is energy in the water or rain
 * on it, on screen and visible, and stops on a flat frame. Under reduced
 * motion nothing travels: a drop shows one still set of rings that fades.
 */
export function DropRipple({
  src,
  alt = "Water over pool tiles",
  children,
  damping = 0.4,
  size = 16,
  rain = 0,
  strength = 0.6,
  refraction = 0.5,
  specular = 0.5,
  wake = 0.25,
  colors = DEFAULT_COLORS,
  tile = 28,
  resolution = 0.5,
  interactive = true,
  label = "Water surface",
  seed = 9,
  dpr = 2,
  paused = false,
  sound = false,
  onDrop,
  className,
}: DropRippleProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [glKey, setGlKey] = React.useState(0);
  const [rings, setRings] = React.useState<
    { id: number; x: number; y: number }[]
  >([]);
  const failed = React.useRef(false);

  // The keyboard's drop marker, as fractions of the box.
  const marker = React.useRef({ x: 0.5, y: 0.5 });
  const markerX = useMotionValue("50%");
  const markerY = useMotionValue("50%");
  const stillAmp = useMotionValue(0);

  const [deep, shallow, line] = colors;
  const params = React.useRef({
    damping,
    size,
    rain,
    strength,
    refraction,
    specular,
    wake,
    tile,
    resolution,
    seed,
    dpr,
    paused,
    motionSafe,
    deep,
    shallow,
    line,
    src,
  });
  React.useEffect(() => {
    params.current = {
      damping,
      size,
      rain,
      strength,
      refraction,
      specular,
      wake,
      tile,
      resolution,
      seed,
      dpr,
      paused,
      motionSafe,
      deep,
      shallow,
      line,
      src,
    };
  });

  const api = React.useRef<{
    drop: (x: number, y: number, depth: number, radius: number) => void;
    still: (x: number, y: number) => void;
    wake: () => void;
    restyle: () => void;
    reload: () => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const fail = () => {
      failed.current = true;
    };
    const gl = createGL(canvas, { alpha: false });
    if (!gl) {
      fail();
      return;
    }
    const sim = createProgram(gl, FULLSCREEN_VERTEX, SIM);
    const show = createProgram(gl, FULLSCREEN_VERTEX, RENDER);
    if (!sim || !show) {
      sim?.dispose();
      show?.dispose();
      fail();
      return;
    }
    failed.current = false;
    const simTri = createFullscreenTriangle(gl, sim);
    const showTri = createFullscreenTriangle(gl, show);
    const S = sim.uniforms;
    const V = show.uniforms;
    const read = rgbReader();
    const queue = new Float32Array(MAX_DROPS * 4);
    let pair: PingPong | null = null;
    let image: WebGLTexture | null = null;
    let imageSize = { w: 0, h: 0 };
    let queued = 0;
    let w = 0;
    let h = 0;
    let simW = 1;
    let simH = 1;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let energy = 0;
    let inView = true;
    let lost = false;
    let shown = false;
    let rainClock = 0;
    let nextRain = 0;
    let rnd = mulberry32(params.current.seed * 7919 + 3);
    const tones = {
      deep: [0.2, 0.3, 0.6] as Rgb,
      shallow: [0.4, 0.7, 0.7] as Rgb,
      line: [0.1, 0.15, 0.3] as Rgb,
      glint: [1, 1, 1] as Rgb,
    };
    const stillAt = { x: 0.5, y: 0.5 };

    const restyle = () => {
      const probe = probeRef.current;
      if (!probe) return;
      const p = params.current;
      const unit = (css: string): Rgb => {
        probe.style.color = css;
        const c = read(getComputedStyle(probe).color);
        return [c[0] / 255, c[1] / 255, c[2] / 255];
      };
      tones.deep = unit(p.deep);
      tones.shallow = unit(p.shallow);
      tones.line = unit(p.line);
      tones.glint = unit("oklch(0.99 0.01 95)");
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
      if (w < 2 || h < 2) return false;
      const res = clamp(params.current.resolution, 0.25, 1);
      const sw = Math.max(8, Math.round(w * res));
      const sh = Math.max(8, Math.round(h * res));
      if (!pair || sw !== simW || sh !== simH) {
        pair?.dispose();
        simW = sw;
        simH = sh;
        pair = createPingPong(gl, simW, simH, true);
        still(gl, pair.read);
        still(gl, pair.write);
        energy = 0;
      }
      return true;
    };

    const loadImage = () => {
      const url = params.current.src;
      if (image) gl.deleteTexture(image);
      image = null;
      imageSize = { w: 0, h: 0 };
      if (!url) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        if (lost || params.current.src !== url) return;
        image = uploadTexture(gl, img, { linear: true });
        imageSize = { w: img.naturalWidth, h: img.naturalHeight };
        draw();
      };
      img.src = url;
    };

    const step = () => {
      if (!pair) return;
      const p = params.current;
      sim.use();
      pair.write.bind();
      sim.texture("u_state", pair.read.texture, 0);
      gl.uniform2f(S.u_texel ?? null, 1 / simW, 1 / simH);
      gl.uniform1f(S.u_damp ?? null, 0.998 - clamp(p.damping, 0, 1) * 0.033);
      gl.uniform1i(S.u_byte ?? null, pair.precision === "byte" ? 1 : 0);
      if (S.u_drops) gl.uniform4fv(S.u_drops, queue);
      gl.uniform1i(S.u_count ?? null, queued);
      simTri.draw();
      pair.swap();
      queued = 0;
      const damp = 0.998 - clamp(p.damping, 0, 1) * 0.033;
      energy *= damp * damp;
    };

    const draw = () => {
      if (lost || gl.isContextLost() || !pair) return;
      const p = params.current;
      resizeGL(gl, canvas, { dprCap: Math.min(2, Math.max(1, p.dpr)) });
      bindScreen(gl);
      show.use();
      show.texture("u_state", pair.read.texture, 0);
      // With no picture the sampler still needs a complete texture: the
      // state stands in, unread.
      show.texture("u_image", image ?? pair.read.texture, 1);
      gl.uniform2f(V.u_texel ?? null, 1 / simW, 1 / simH);
      gl.uniform1i(V.u_byte ?? null, pair.precision === "byte" ? 1 : 0);
      gl.uniform1i(V.u_live ?? null, p.motionSafe ? 1 : 0);
      gl.uniform1i(V.u_photo ?? null, image ? 1 : 0);
      // object-fit: cover, as a scale and offset on the image's uv.
      let sx = 1;
      let sy = 1;
      if (image && imageSize.w > 0 && imageSize.h > 0) {
        const box = w / h;
        const pic = imageSize.w / imageSize.h;
        if (pic > box) sx = box / pic;
        else sy = pic / box;
      }
      gl.uniform4f(V.u_cover ?? null, sx, sy, (1 - sx) / 2, (1 - sy) / 2);
      gl.uniform2f(V.u_res ?? null, w, h);
      gl.uniform1f(V.u_tile ?? null, Math.max(6, p.tile));
      gl.uniform3fv(V.u_deep ?? null, tones.deep);
      gl.uniform3fv(V.u_shallow ?? null, tones.shallow);
      gl.uniform3fv(V.u_line ?? null, tones.line);
      gl.uniform3fv(V.u_glint ?? null, tones.glint);
      gl.uniform1f(V.u_refract ?? null, clamp(p.refraction, 0, 1));
      gl.uniform1f(V.u_spec ?? null, clamp(p.specular, 0, 1));
      gl.uniform1f(V.u_seed ?? null, (p.seed % 89) * 0.61);
      gl.uniform4f(
        V.u_still ?? null,
        stillAt.x,
        stillAt.y,
        0,
        stillAmp.get() * clamp(p.strength, 0, 1) * 1.6,
      );
      showTri.draw();
      if (!shown) {
        shown = true;
        setReady(true);
      }
    };

    const queueDrop = (x: number, y: number, depth: number, radius: number) => {
      if (queued >= MAX_DROPS) return;
      const res = clamp(params.current.resolution, 0.25, 1);
      const i = queued * 4;
      queue[i] = x * simW;
      queue[i + 1] = (1 - y) * simH;
      queue[i + 2] = Math.max(1, radius * res);
      queue[i + 3] = depth;
      queued += 1;
      energy += depth * depth * radius * radius;
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (lost || !inView || document.hidden || !p.motionSafe) {
        last = 0;
        return;
      }
      if (p.paused) {
        draw();
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP * 2;
      last = now;
      // Seeded rain, scaled to the surface's area.
      const rainRate =
        clamp(p.rain, 0, 1) * 8 * Math.max(0.35, (w * h) / (760 * 200));
      if (rainRate > 0) {
        rainClock += dt;
        while (rainClock >= nextRain) {
          const radius = p.size * (0.3 + rnd() * 0.3);
          queueDrop(
            rnd(),
            rnd(),
            clamp(p.strength, 0, 1) * (0.25 + rnd() * 0.25),
            radius,
          );
          nextRain += -Math.log(1 - rnd() * 0.999) / rainRate;
        }
      }
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        step();
        acc -= STEP;
        steps += 1;
      }
      if (steps === 4) acc = 0;
      draw();
      if (energy < 0.02 && rainRate === 0 && queued === 0) {
        // Still water: flatten what is left and stop on a clean frame.
        if (pair) {
          still(gl, pair.read);
          still(gl, pair.write);
        }
        energy = 0;
        draw();
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || lost) return;
      if (!params.current.motionSafe) {
        draw();
        return;
      }
      if (!inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    api.current = {
      drop: (x, y, depth, radius) => {
        queueDrop(x, y, depth, radius);
        start();
      },
      still: (x, y) => {
        stillAt.x = x;
        stillAt.y = y;
      },
      wake: start,
      restyle: () => {
        restyle();
        if (!raf) draw();
      },
      reload: loadImage,
    };

    restyle();
    loadImage();
    const sizer = new ResizeObserver(() => {
      if (!layout()) return;
      draw();
      start();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) start();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const offStill = stillAmp.on("change", () => {
      if (!raf) draw();
    });
    const detach = onContextLoss(
      canvas,
      () => {
        lost = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        setReady(false);
      },
      () => setGlKey((k) => k + 1),
    );
    rnd = mulberry32(params.current.seed * 7919 + 3);
    nextRain = 0;

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lost = true;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      offStill();
      detach();
      pair?.dispose();
      if (image) gl.deleteTexture(image);
      simTri.dispose();
      showTri.dispose();
      sim.dispose();
      show.dispose();
      api.current = null;
    };
  }, [glKey, stillAmp]);

  React.useEffect(() => {
    api.current?.restyle();
  }, [deep, shallow, line, tile, refraction, specular, seed]);
  React.useEffect(() => {
    api.current?.reload();
  }, [src]);
  React.useEffect(() => {
    api.current?.wake();
  }, [rain, damping, paused, resolution, dpr, motionSafe]);

  const nextRing = React.useRef(0);
  /** A drop the visitor makes, at fractions of the box. */
  const dropAt = (
    x: number,
    y: number,
    clientX: number | null,
    quiet = false,
  ) => {
    onDrop?.(r3(x), r3(y));
    if (!quiet) {
      audio.play("plip", {
        pitch: clamp(1.45 - size / 50, 0.6, 1.5),
        gain: 0.5,
        pan: clientX !== null ? panFrom(clientX, rootRef.current) : 0,
      });
    }
    if (failed.current) {
      // No WebGL: the still picture shows a ring where the drop landed.
      nextRing.current += 1;
      const id = nextRing.current;
      setRings((list) => [...list.slice(-3), { id, x, y }]);
      return;
    }
    if (!motionSafe) {
      // Reduced motion: one still set of rings, fading where it fell.
      api.current?.still(x, y);
      stillAmp.jump(1);
      animate(stillAmp, 0, { duration: 0.6, ease: easings.exit });
      return;
    }
    api.current?.drop(x, y, clamp(strength, 0, 1), Math.max(2, size));
  };

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  };

  // The wake: shallow drops spaced along the pointer's path.
  const trail = React.useRef<{ x: number; y: number } | null>(null);
  const heard = React.useRef(0);
  const lay = (
    clientX: number,
    clientY: number,
    depth: number,
    sounding: boolean,
  ) => {
    const at = local(clientX, clientY);
    const rect = rootRef.current?.getBoundingClientRect();
    if (!at || !rect) return;
    const prev = trail.current;
    if (prev) {
      const d = Math.hypot(
        (at.x - prev.x) * rect.width,
        (at.y - prev.y) * rect.height,
      );
      if (d < Math.max(4, size * 0.4)) return;
    }
    trail.current = at;
    const now = performance.now();
    if (sounding && now - heard.current > 140) {
      heard.current = now;
      audio.play("plip", {
        pitch: clamp(1.7 - size / 50, 0.7, 1.8),
        gain: 0.22,
        pan: panFrom(clientX, rootRef.current),
      });
    }
    if (motionSafe && !failed.current) {
      api.current?.drop(at.x, at.y, depth, Math.max(2, size * 0.7));
    }
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !interactive,
    onStart: ({ point }) => {
      trail.current = null;
      lay(point.x, point.y, clamp(strength, 0, 1) * 0.35, true);
    },
    onMove: ({ point }) =>
      lay(point.x, point.y, clamp(strength, 0, 1) * 0.35, true),
    onEnd: () => {
      trail.current = null;
    },
    onCancel: () => {
      trail.current = null;
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    if (at) dropAt(at.x, at.y, event.clientX);
    drag.onPointerDown(event);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!interactive || event.pointerType !== "mouse" || event.buttons !== 0)
      return;
    if (wake <= 0) return;
    lay(
      event.clientX,
      event.clientY,
      clamp(strength, 0, 1) * clamp(wake, 0, 1) * 0.22,
      false,
    );
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const stepBy = event.shiftKey ? 0.18 : 0.06;
    const m = marker.current;
    let moved = false;
    if (event.key === "ArrowLeft") {
      m.x = clamp(m.x - stepBy, 0.04, 0.96);
      moved = true;
    } else if (event.key === "ArrowRight") {
      m.x = clamp(m.x + stepBy, 0.04, 0.96);
      moved = true;
    } else if (event.key === "ArrowUp") {
      m.y = clamp(m.y - stepBy, 0.06, 0.94);
      moved = true;
    } else if (event.key === "ArrowDown") {
      m.y = clamp(m.y + stepBy, 0.06, 0.94);
      moved = true;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) dropAt(m.x, m.y, null);
      return;
    }
    if (moved) {
      event.preventDefault();
      const to = (v: number) => `${Math.round(v * 1000) / 10}%`;
      if (motionSafe) {
        animate(markerX, to(m.x), springs.snap);
        animate(markerY, to(m.y), springs.snap);
      } else {
        markerX.jump(to(m.x));
        markerY.jump(to(m.y));
      }
    }
  };

  const tilePx = Math.max(6, tile);

  return (
    <div className={cn("relative h-56 w-full rounded-3", className)}>
      <div
        ref={rootRef}
        role={interactive ? "button" : "img"}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : alt}
        aria-describedby={interactive ? hintId : undefined}
        onKeyDown={onKeyDown}
        {...drag}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        className={cn(
          "group/drop-ripple absolute inset-0 isolate overflow-hidden rounded-[inherit] select-none",
          interactive &&
            "cursor-crosshair touch-pan-y outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      >
        {/* The still picture without WebGL, and before the first frame. */}
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, color-mix(in oklab, ${deep} 70%, transparent), transparent 85%), repeating-linear-gradient(90deg, color-mix(in oklab, ${line} 45%, transparent) 0 1px, transparent 1px ${tilePx}px), repeating-linear-gradient(0deg, color-mix(in oklab, ${line} 45%, transparent) 0 1px, transparent 1px ${tilePx}px), ${shallow}`,
            }}
          />
        )}
        {rings.map((ring) => (
          <motion.span
            key={ring.id}
            aria-hidden
            className="pointer-events-none absolute size-24 rounded-full border-2 border-foreground/40"
            style={{
              left: `${Math.round(ring.x * 1000) / 10}%`,
              top: `${Math.round(ring.y * 1000) / 10}%`,
              translateX: "-50%",
              translateY: "-50%",
            }}
            initial={{ opacity: 1, scale: motionSafe ? 0.1 : 1 }}
            animate={{ opacity: 0, scale: 1 }}
            transition={{ duration: durations.page, ease: easings.enter }}
            onAnimationComplete={() =>
              setRings((list) => list.filter((r) => r.id !== ring.id))
            }
          />
        ))}
        <motion.canvas
          key={glKey}
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          initial={false}
          animate={{ opacity: ready ? 1 : 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
        />
        {interactive ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute z-20 rounded-full border-2 border-foreground/70 opacity-0 transition-opacity group-focus-visible/drop-ripple:opacity-100"
            style={{
              left: markerX,
              top: markerY,
              width: Math.max(12, size * 2),
              height: Math.max(12, size * 2),
              translateX: "-50%",
              translateY: "-50%",
            }}
          />
        ) : null}
        {interactive ? (
          <span id={hintId} className="sr-only">
            {alt}. Press Enter or Space to drop into the water at the marker;
            the arrow keys move the marker.
          </span>
        ) : null}
        <span
          ref={probeRef}
          aria-hidden
          className="pointer-events-none absolute size-0 overflow-hidden"
        />
        {/* A theme change shows up as this carrier's 1ms colour transition. */}
        <span
          aria-hidden
          onTransitionEnd={() => api.current?.restyle()}
          className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
        />
      </div>
      {/* Outside the button, so its words stay readable as words. */}
      {children ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          {children}
        </div>
      ) : null}
    </div>
  );
}
