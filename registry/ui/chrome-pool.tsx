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
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ChromePoolTint = "chrome" | "gold" | "rose" | "cobalt";

export type ChromePoolProps = {
  /** The content on top of the metal: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The metal's colour: a named finish or any CSS colour. @default "chrome" */
  tint?: ChromePoolTint | (string & {});
  /** How much the surface swells, 0 (a mirror) to 1. @default 0.5 */
  ripple?: number;
  /** How soft the reflections are, 0 (mirror sharp) to 1 (satin). @default 0.25 */
  roughness?: number;
  /** How fast the swells move, 0 (held) to 2. @default 0.6 */
  speed?: number;
  /** The length of a swell, px at the middle of the frame. @default 300 */
  scale?: number;
  /** How steeply the pool is seen, degrees (20 grazing to 70 looking down). @default 34 */
  angle?: number;
  /** The pointer and keyboard focus press dimples into the metal. @default true */
  interactive?: boolean;
  /** How deep a press goes, 0 to 1; resting the pointer presses a quarter of it. @default 0.6 */
  pointerStrength?: number;
  /** A dimple's size where it is pressed, px. @default 70 */
  radius?: number;
  /** How springy a dimple is coming back, 0 (settles dead) to 1 (wobbles). @default 0.55 */
  bounce?: number;
  /** Hold the swells still; dimples still press and spring back. @default false */
  paused?: boolean;
  /** Seeds the swells' headings and lengths. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a press drives a dimple in (true) and when it lets go (false). */
  onPressChange?: (pressed: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Finishes as pigments at fixed lightness: metal is metal in either theme. */
const TINTS: Record<ChromePoolTint, string> = {
  chrome: "oklch(0.9 0.006 250)",
  gold: "oklch(0.86 0.09 85)",
  rose: "oklch(0.84 0.055 32)",
  cobalt: "oklch(from var(--accent-bright) 0.8 calc(c * 0.45) h)",
};

/**
 * The studio, from the page's tokens: a floor and flags that sink toward
 * black, a cyclorama and ceiling drawn from the page, white softboxes and a
 * warm kicker. Mixes toward black and white are in oklab.
 */
const STUDIO = [
  "color-mix(in oklab, var(--background) 22%, black)",
  "color-mix(in oklab, var(--background) 72%, var(--foreground))",
  "color-mix(in oklab, var(--background) 90%, var(--foreground))",
  "oklch(0.99 0.004 250)",
  "oklch(0.93 0.045 70)",
] as const;

/** The swells, relative to `scale`: length, steepness and how far each turns off the main heading. */
const WAVES = [
  [1, 0.5, 0],
  [0.72, 0.3, 0.7],
  [0.55, 0.2, -0.55],
  [1.45, 0.34, -0.25],
  [0.4, 0.06, 1.3],
] as const;

const DIMPLES = 6;
const RENDER_SCALE = 0.75;
const STEP = 1 / 120;
const LAND = springs.recoil;
/** A keyboard tap holds the dimple this long before letting go, ms. */
const TAP = 140;

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

/** The elements a backdrop leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform float u_aspect;
uniform float u_pitch;
uniform float u_tan;
uniform float u_azMax;
uniform vec2 u_eRange;
uniform vec4 u_waves[5];
uniform float u_amp[5];
uniform vec4 u_dimples[6];
uniform float u_rough;
uniform vec3 u_tint;
uniform vec3 u_floor;
uniform vec3 u_wall;
uniform vec3 u_ceil;
uniform vec3 u_box;
uniform vec3 u_warm;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// A strip light, or a flag, running the width of the studio.
float band(float y, float c, float h, float soft) {
  return 1.0 - smoothstep(h - soft, h + soft, abs(y - c));
}

// The studio, seen along R: azimuth across the frame (-1 to 1 at its
// edges) and elevation down it (0 where the top of a still pool reflects,
// 1 where the bottom does), so the lights frame every aspect. Long strip
// lights and a dark flag are what make metal read as metal: on a moving
// surface they become flowing lines of light and shadow.
vec3 studio(vec3 R) {
  float e = asin(clamp(R.y, -1.0, 1.0));
  vec2 p = vec2(atan(R.x, -R.z) / u_azMax, (e - u_eRange.x) / (u_eRange.y - u_eRange.x));
  float soft = 0.008 + u_rough * 0.1;
  float peak = 1.0 - u_rough * 0.35;
  vec3 col = mix(u_wall, u_ceil, smoothstep(0.0, 1.6, p.y));
  col = mix(u_floor, col, smoothstep(-0.05, 0.04, e));
  float key = exp(-pow((p.x + 0.12) / 0.6, 2.0) - pow((p.y - 0.34) / 0.18, 2.0));
  col = mix(col, u_box, 0.5 * key * peak);
  col = mix(col, u_floor, 0.82 * band(p.y, 0.64, 0.058, soft));
  col = mix(col, u_floor, 0.5 * band(p.y, 0.05, 0.03, soft));
  col = mix(col, u_box, peak * band(p.y, 0.21, 0.016, soft));
  col = mix(col, u_box, 0.95 * peak * band(p.y, 0.46, 0.028, soft));
  col = mix(col, u_box, 0.85 * peak * band(p.y, 0.9, 0.022, soft));
  col = mix(col, u_box, 0.75 * peak * band(p.y, 1.3, 0.05, soft));
  float warm = exp(-pow((p.x - 0.85) / 0.3, 2.0) - pow((p.y - 0.42) / 0.3, 2.0));
  col = mix(col, u_warm, 0.45 * warm * peak);
  return col;
}

void main() {
  vec2 ndc = vec2((v_uv.x * 2.0 - 1.0) * u_aspect, 1.0 - v_uv.y * 2.0);
  float s = sin(u_pitch);
  float c = cos(u_pitch);
  vec3 dir = normalize(vec3(0.0, -s, -c) + vec3(ndc.x * u_tan, 0.0, 0.0) + vec3(0.0, c, -s) * ndc.y * u_tan);
  float t = 1.0 / max(-dir.y, 1e-3);
  vec2 P = vec2(dir.x, dir.z) * t;
  vec2 g = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    vec4 w = u_waves[i];
    g += u_amp[i] * w.z * cos(w.z * dot(w.xy, P) - w.w) * w.xy;
  }
  // The far surface settles: swells packed tighter than a pixel would
  // only shimmer there.
  float tc = t * s;
  g /= 1.0 + 0.6 * tc * tc;
  for (int i = 0; i < 6; i++) {
    vec4 d = u_dimples[i];
    if (d.z == 0.0) continue;
    vec2 q = P - d.xy;
    float r2 = d.w * d.w;
    float ss = dot(q, q) / r2;
    if (ss > 9.0) continue;
    // A well with a raised rim: h = -depth (1 - 1.6 s) e^-s.
    g -= d.z * exp(-ss) * (-2.6 + 1.6 * ss) * 2.0 * q / r2;
  }
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 R = reflect(dir, N);
  vec3 env = studio(R);
  env = mix(env, (u_wall + u_ceil) * 0.5, u_rough * 0.3);
  float facing = clamp(dot(-dir, N), 0.0, 1.0);
  vec3 fres = u_tint + (vec3(1.0) - u_tint) * pow(1.0 - facing, 5.0);
  vec3 col = env * fres;
  // Far metal dissolves into the studio, so the pool has depth.
  float far = pow(1.0 - v_uv.y, 3.0);
  col = mix(col, u_wall * u_tint, 0.3 * far);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  ripple: number;
  roughness: number;
  speed: number;
  scale: number;
  angle: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  bounce: number;
  paused: boolean;
  seed: number;
  dpr: number;
  paintKey: string;
  motionSafe: boolean;
  onPress: (pressed: boolean) => void;
};

type Dimple = {
  x: number;
  z: number;
  r: number;
  depth: number;
  v: number;
  target: number;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number) => void;
  handAway: () => void;
  press: (x: number, y: number) => void;
  release: () => void;
  tap: (x: number, y: number) => void;
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
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let failed = false;
  let tapTimer = 0;
  const read = rgbReader();
  const colours = new Float32Array(18);
  const waves = new Float32Array(20);
  const amps = new Float32Array(5);
  const omegas = new Float32Array(5);
  const phases = new Float32Array(5);
  const dimpleData = new Float32Array(DIMPLES * 4);
  const size = { w: 0, h: 0 };
  const cam = { pitch: 0.6, tan: 0.45, aspect: 1, azMax: 1, eTop: 0, eBot: 1 };
  let time = 0;
  const dimples: Dimple[] = Array.from({ length: DIMPLES }, () => ({
    x: 0,
    z: 0,
    r: 1,
    depth: 0,
    v: 0,
    target: 0,
  }));
  const hand = { present: false, pressed: false, cur: -1, x: 0, z: 0 };

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

  /** The camera for the current box and angle. */
  const camera = () => {
    const c = cfg;
    if (!c || size.h < 1) return;
    const pitch = (clamp(c.angle, 20, 70) * Math.PI) / 180;
    const half = pitch * 0.75;
    cam.pitch = pitch;
    cam.tan = Math.tan(half);
    cam.aspect = size.w / size.h;
    cam.azMax = Math.atan((cam.tan * cam.aspect) / Math.cos(pitch));
    cam.eTop = pitch - half;
    cam.eBot = pitch + half;
  };

  /** A point in the box, as the pool's plane coordinates and its distance along the ray. */
  const toPlane = (x: number, y: number) => {
    const sx = (x / Math.max(1, size.w)) * 2 - 1;
    const sy = 1 - (y / Math.max(1, size.h)) * 2;
    const nx = sx * cam.aspect * cam.tan;
    const ny = sy * cam.tan;
    const s = Math.sin(cam.pitch);
    const c = Math.cos(cam.pitch);
    let dx = nx;
    let dy = -s + c * ny;
    let dz = -c - s * ny;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    const t = 1 / Math.max(-dy, 1e-3);
    return { x: dx * t, z: dz * t, t };
  };

  /** Plane units per CSS px at distance t along a ray. */
  const unitsPerPx = (t: number) => (2 * t * cam.tan) / Math.max(1, size.h);

  const waveSetup = () => {
    const c = cfg;
    if (!c) return;
    const rand = lcg(c.seed * 41 + 9);
    const heading = rand() * Math.PI * 2;
    // Swell lengths are px at the middle of the frame.
    const mid = unitsPerPx(1 / Math.sin(cam.pitch));
    const lambda = Math.max(40, c.scale) * mid;
    const slope = 0.015 + clamp(c.ripple, 0, 1) * 0.2;
    WAVES.forEach(([length, steep, turn], i) => {
      const a = heading + turn + (rand() - 0.5) * 0.3;
      const k = (Math.PI * 2) / (lambda * length);
      waves[i * 4] = Math.cos(a);
      waves[i * 4 + 1] = Math.sin(a);
      waves[i * 4 + 2] = k;
      amps[i] = (slope * steep) / k;
      // Longer swells run faster, as deep water does.
      omegas[i] = 0.75 * Math.sqrt(k * lambda) * (0.85 + rand() * 0.3);
      phases[i] = rand() * Math.PI * 2;
    });
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_aspect ?? null, cam.aspect);
    gl.uniform1f(u.u_pitch ?? null, cam.pitch);
    gl.uniform1f(u.u_tan ?? null, cam.tan);
    gl.uniform1f(u.u_azMax ?? null, cam.azMax);
    gl.uniform2f(u.u_eRange ?? null, cam.eTop, cam.eBot);
    gl.uniform1fv(u.u_amp ?? null, amps);
    gl.uniform1f(u.u_rough ?? null, clamp(c.roughness, 0, 1));
    const names = ["u_tint", "u_floor", "u_wall", "u_ceil", "u_box", "u_warm"];
    for (let i = 0; i < names.length; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_tint"] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    }
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    const t = c.motionSafe ? time : 7;
    for (let i = 0; i < 5; i += 1) {
      waves[i * 4 + 3] =
        (omegas[i] ?? 0) * t * clamp(c.speed, 0, 2) * 0.35 + (phases[i] ?? 0);
    }
    gl.uniform4fv(u.u_waves ?? null, waves);
    for (let i = 0; i < DIMPLES; i += 1) {
      const d = dimples[i];
      const live = d && Math.abs(d.depth) > 1e-5;
      dimpleData[i * 4] = live ? d.x : 0;
      dimpleData[i * 4 + 1] = live ? d.z : 0;
      dimpleData[i * 4 + 2] = live ? d.depth : 0;
      dimpleData[i * 4 + 3] = live ? d.r : 1;
    }
    gl.uniform4fv(u.u_dimples ?? null, dimpleData);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances time and the dimples' springs. Returns whether anything moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const swelling = !c.paused && c.speed > 0 && c.ripple > 0;
    if (swelling) time += dt;
    const k = LAND.stiffness;
    const zeta = 1 - 0.65 * clamp(c.bounce, 0, 1);
    const damp = 2 * zeta * Math.sqrt(k);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    let springing = false;
    for (const d of dimples) {
      if (d.depth === 0 && d.v === 0 && d.target === 0) continue;
      for (let s = 0; s < steps; s += 1) {
        d.v += (k * (d.target - d.depth) - damp * d.v) * h;
        d.depth += d.v * h;
      }
      const scale = Math.max(1e-4, d.r * 0.3);
      if (
        Math.abs(d.target - d.depth) < scale * 0.004 &&
        Math.abs(d.v) < scale * 0.05
      ) {
        d.depth = d.target;
        d.v = 0;
      } else springing = true;
    }
    return swelling || springing;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Swells alone move slowly enough for thirty frames a second.
    let calm = true;
    for (const d of dimples)
      if (d.v !== 0 || d.depth !== d.target) calm = false;
    if (calm && last && now - drawnAt < 31) {
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

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 6; i += 1) {
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
    resizeGL(p.gl, canvas, {
      dprCap: clamp(c.dpr, 0.5, 2),
      renderScale: RENDER_SCALE,
    });
    camera();
    waveSetup();
    statics();
    draw();
    kick();
  };

  const startGpu = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  /** Depth targets in plane units for a dimple of radius r. */
  const depthFor = (r: number, pressed: boolean) => {
    const c = cfg;
    const k = clamp(c?.pointerStrength ?? 0.6, 0, 1);
    return r * 0.34 * k * (pressed ? 1 : 0.25);
  };

  /** The hand is at (x, y): its dimple follows, leaving recovering ones behind. */
  const place = (x: number, y: number) => {
    const c = cfg;
    if (!c) return;
    const at = toPlane(x, y);
    const r = Math.max(4, c.radius) * unitsPerPx(at.t);
    const cur = hand.cur >= 0 ? dimples[hand.cur] : undefined;
    const target = depthFor(r, hand.pressed);
    if (cur && Math.hypot(cur.x - at.x, cur.z - at.z) < cur.r * 0.5) {
      cur.target = target;
      if (!c.motionSafe) cur.depth = target;
      return;
    }
    if (cur) {
      cur.target = 0;
      if (!c.motionSafe) cur.depth = 0;
    }
    // A free dimple, or else the calmest gives way.
    let pick = 0;
    let calmest = Infinity;
    for (let i = 0; i < DIMPLES; i += 1) {
      if (i === hand.cur) continue;
      const d = dimples[i];
      if (!d) continue;
      const energy =
        Math.abs(d.depth) + Math.abs(d.v) * 0.05 + Math.abs(d.target);
      if (energy < calmest) {
        calmest = energy;
        pick = i;
      }
    }
    const d = dimples[pick];
    if (!d) return;
    d.x = at.x;
    d.z = at.z;
    d.r = r;
    d.depth = c.motionSafe ? 0 : target;
    d.v = 0;
    d.target = target;
    hand.cur = pick;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS still frame stays, and nothing retries.
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
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr || was.angle !== next.angle) resize();
      else if (
        was.scale !== next.scale ||
        was.seed !== next.seed ||
        was.ripple !== next.ripple
      ) {
        waveSetup();
      }
      if (was.paintKey !== next.paintKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.pressed = false;
        for (const d of dimples) d.target = 0;
        hand.cur = -1;
      }
      if (!next.motionSafe) {
        for (const d of dimples) {
          d.depth = d.target;
          d.v = 0;
        }
      }
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
    handTo(x, y) {
      const c = cfg;
      if (!c || !c.interactive) return;
      hand.present = true;
      place(x, y);
      kick();
    },
    handAway() {
      hand.present = false;
      if (hand.pressed) {
        hand.pressed = false;
        cfg?.onPress(false);
      }
      const cur = hand.cur >= 0 ? dimples[hand.cur] : undefined;
      if (cur) {
        cur.target = 0;
        if (!cfg?.motionSafe) cur.depth = 0;
      }
      hand.cur = -1;
      kick();
    },
    press(x, y) {
      const c = cfg;
      if (!c || !c.interactive) return;
      hand.present = true;
      if (!hand.pressed) {
        hand.pressed = true;
        c.onPress(true);
      }
      place(x, y);
      kick();
    },
    release() {
      if (!hand.pressed) return;
      hand.pressed = false;
      const cur = hand.cur >= 0 ? dimples[hand.cur] : undefined;
      // Let go: the dimple springs back past level and wobbles home.
      if (cur) {
        cur.target = hand.present ? depthFor(cur.r, false) : 0;
        if (!cfg?.motionSafe) cur.depth = cur.target;
      }
      cfg?.onPress(false);
      kick();
    },
    tap(x, y) {
      const c = cfg;
      if (!c || !c.interactive) return;
      const keep = hand.present;
      hand.present = true;
      hand.pressed = true;
      c.onPress(true);
      place(x, y);
      kick();
      if (tapTimer) window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => {
        tapTimer = 0;
        const cur = hand.cur >= 0 ? dimples[hand.cur] : undefined;
        if (cur) {
          cur.target = 0;
          if (!cfg?.motionSafe) cur.depth = 0;
        }
        hand.pressed = false;
        hand.present = keep;
        hand.cur = -1;
        cfg?.onPress(false);
        kick();
      }, TAP);
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (tapTimer) window.clearTimeout(tapTimer);
      tapTimer = 0;
      detach();
      release();
    },
  };
}

/**
 * A background that is a pool of liquid chrome seen across its surface,
 * with the content on top in its own layer. A WebGL2 shader casts a ray for
 * every pixel from a camera tilted `angle` degrees down, meets the pool,
 * takes the surface's slope from five slow swells (analytic, no simulation)
 * and reflects the view into a soft studio — a graded cyclorama, a large
 * overhead softbox, strip lights, a warm kicker and a dark flag — through a
 * fresnel on the metal's tint. `roughness` softens every edge; the far
 * surface dissolves into the studio.
 *
 * The pointer resting on the metal presses a shallow dimple with a raised
 * rim; a press drives it deep. A moving hand leaves its dimples behind,
 * each a spring with recoil's stiffness and `bounce` for its damping, so
 * they spring back past level into a small bump and wobble home — a trail
 * that recovers behind the hand. Keyboard focus on a control inside taps a
 * dimple there. Thirty frames a second while it only swells, every frame
 * while a dimple moves, nothing off screen or hidden. Without WebGL2, or
 * after a lost context, a CSS still of brushed chrome stands in; under
 * reduced motion one still frame is drawn and dimples press and lift at once.
 */
export function ChromePool({
  children,
  tint = "chrome",
  ripple = 0.5,
  roughness = 0.25,
  speed = 0.6,
  scale = 300,
  angle = 34,
  interactive = true,
  pointerStrength = 0.6,
  radius = 70,
  bounce = 0.55,
  paused = false,
  seed = 1,
  dpr = 2,
  onPressChange,
  className,
}: ChromePoolProps) {
  const motionSafe = useMotionSafe();
  const metal = TINTS[tint as ChromePoolTint] ?? tint;
  const paints = [metal, ...STUDIO];
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef(onPressChange);

  const config: Config = {
    ripple,
    roughness,
    speed,
    scale,
    angle,
    interactive,
    pointerStrength,
    radius,
    bounce,
    paused,
    seed,
    dpr,
    paintKey,
    motionSafe,
    onPress: (p) => report.current?.(p),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onPressChange;
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
      if (document.hidden) engine.current?.handAway();
      else engine.current?.wake();
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

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const pressing = React.useRef<number | null>(null);
  /** Stops listening for the pressing pointer's release. */
  const unlisten = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    const listening = unlisten;
    return () => listening.current?.();
  }, []);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    const at = local(event.clientX, event.clientY);
    if (hit && rootRef.current?.contains(hit)) {
      engine.current?.handTo(at.x, at.y);
      return;
    }
    pressing.current = event.pointerId;
    engine.current?.press(at.x, at.y);
    // A press that ends anywhere — off the pool too — lets go.
    unlisten.current?.();
    const id = event.pointerId;
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      pressing.current = null;
      engine.current?.release();
      if (e.pointerType === "touch" || e.type === "pointercancel")
        engine.current?.handAway();
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    unlisten.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      unlisten.current = null;
    };
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || pressing.current !== null) return;
    engine.current?.handAway();
  };

  // Keyboard focus on a control inside taps the metal there.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.tap(at.x, at.y);
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      className={cn(
        // The hand reads the pointer without holding it: the page scrolls.
        "group/chrome-pool relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/chrome-pool:invisible group-data-live/chrome-pool:opacity-0"
        style={standIn(paints)}
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
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: brushed chrome in horizontal bands — the studio's floor,
 * wall and softboxes as a polished bar reflects them — with fine streaks.
 */
function standIn(paints: readonly string[]): React.CSSProperties {
  const [metal, floor, wall, ceil, box] = paints;
  const tinted = (c: string | undefined, k: number) =>
    `color-mix(in oklab, ${c ?? "gray"} ${k}%, ${metal ?? "gray"})`;
  return {
    backgroundColor: tinted(wall, 70),
    backgroundImage: [
      `repeating-linear-gradient(180deg, transparent 0 3px, color-mix(in oklab, ${floor ?? "black"} 6%, transparent) 3px 4px)`,
      `linear-gradient(180deg, ${tinted(wall, 75)} 0%, ${tinted(ceil, 70)} 18%, ${tinted(box, 80)} 30%, ${tinted(wall, 70)} 40%, ${tinted(floor, 75)} 52%, ${tinted(wall, 70)} 66%, ${tinted(box, 70)} 78%, ${tinted(ceil, 70)} 88%, ${tinted(floor, 60)} 100%)`,
    ].join(", "),
  };
}
