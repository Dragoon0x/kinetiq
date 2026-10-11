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
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SingingBowlMetal = "brass" | "bronze" | "copper" | "pewter";

export type SingingBowlProps = {
  /** The highest petal order rubbing can reach, 2 (four petals) to 8 (sixteen). @default 5 */
  modes?: number;
  /** How fast the singing dies, 0 (rings on and on) to 1 (dies at once). @default 0.4 */
  damping?: number;
  /** The bowl's metal: a preset, or any CSS colour. @default "brass" */
  metal?: SingingBowlMetal | (string & {});
  /** How much each circle of the rim puts into the water, 0 to 1. @default 0.5 */
  sensitivity?: number;
  /** How many standing rings run inward at full energy, 2 to 8. @default 5 */
  rings?: number;
  /** The rim's highlights and its glint, 0 (satin) to 1 (polished). @default 0.6 */
  glint?: number;
  /** The colour of the bowl's floor seen through the water, any CSS colour. @default a dark tint of the metal */
  waterColor?: string;
  /** The pointer and touch rub and strike the rim. Keys still do. @default true */
  interactive?: boolean;
  /** Hold the water still: the pattern stays where it is. @default false */
  paused?: boolean;
  /** The bowl's accessible name. @default "Singing bowl" */
  label?: string;
  /** Hum while the bowl sings. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires as the bowl starts and stops singing. */
  onSingingChange?: (singing: boolean) => void;
  /** Fires as the number of petals at the rim changes while it sings. */
  onModeChange?: (petals: number) => void;
  /** Seeds the brushing on the rim and the hammer marks in the floor. @default 2 */
  seed?: number;
  /** Nothing reaches the bowl and its button is disabled. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the bowl; it is a circle fitted to the box. @default "size-56" */
  className?: string;
};

const METALS: Record<SingingBowlMetal, string> = {
  brass: "oklch(from var(--warn) 0.72 0.11 calc(h - 2))",
  bronze: "oklch(from var(--warn) 0.58 0.09 calc(h - 28))",
  copper: "oklch(from var(--danger) 0.64 0.12 calc(h + 28))",
  pewter: "oklch(from var(--ink-3) 0.72 0.012 h)",
};

const metalOf = (metal: string) =>
  (METALS as Record<string, string>)[metal] ?? metal;

/** The bowl's colours from its metal: body, highlight, shadow, floor, sky, shadow on the page. */
const tones = (metal: string, water?: string) => {
  const m = metalOf(metal);
  return [
    m,
    `oklch(from ${m} calc(l + 0.2) calc(c * 0.55) h)`,
    `oklch(from ${m} calc(l * 0.4) calc(c * 0.8) h)`,
    water ?? `oklch(from ${m} 0.34 calc(c * 0.6) calc(h + 8))`,
    "oklch(0.96 0.012 240)",
    "oklch(from var(--ink) 0.25 0.02 h)",
  ];
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec2 u_c;
uniform float u_R;
uniform float u_rimIn;
uniform float u_water;
uniform vec3 u_metal;
uniform vec3 u_hi;
uniform vec3 u_lo;
uniform vec3 u_floor;
uniform vec3 u_sky;
uniform vec4 u_shade;
uniform float u_time;
uniform float u_energy;
uniform float u_order;
uniform float u_rings;
uniform float u_spin;
uniform float u_glint;
uniform float u_glintA;
uniform float u_shine;
uniform vec4 u_strike;
uniform vec3 u_mallet;
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;
${GLSL_NOISE}

const float PI = 3.14159265;

// The water's height: a standing wave, cos(nθ) petals at the wall times
// rings running inward, whose reach shrinks with the energy so the rings let
// go from the centre out; plus one ring packet from a strike.
float waterH(vec2 p) {
  vec2 d = p - u_c;
  float r = length(d) / u_water;
  if (r > 1.0) return 0.0;
  float th = atan(d.y, d.x) - u_spin;
  float n0 = floor(u_order);
  float fr = u_order - n0;
  float ang = mix(cos(n0 * th), cos((n0 + 1.0) * th), smoothstep(0.0, 1.0, fr));
  float radial = cos(u_rings * PI * (1.0 - r));
  float reach = clamp(u_energy * 1.2, 0.0, 1.0);
  float env = smoothstep(1.0 - reach, 1.0 - reach + 0.22, r) * (0.3 + 0.7 * r * r);
  // It stands rather than travels: the pattern holds its place and pulses.
  float h = u_energy * ang * radial * env * (0.55 + 0.45 * cos(u_time * 7.0));
  if (u_strike.w > 0.0) {
    float ds = length(p - u_strike.xy) / u_water;
    float x = ds - u_strike.z * 0.85;
    h += u_strike.w * exp(-x * x / 0.004) * cos(x * 70.0) * exp(-u_strike.z * 1.2) * 0.8;
  }
  // The water meets the wall at the wall's height: no wave past the rim.
  return h * smoothstep(1.0, 0.94, r);
}

void main() {
  vec2 p = v_uv * u_res;
  vec2 d = p - u_c;
  float r = length(d);
  vec2 dir = d / max(r, 1e-3);
  float aa = max(fwidth(r), 0.75);
  vec3 L = normalize(vec3(-0.5, -0.62, 0.6));

  // The bowl's shadow on the page, a little down and right.
  float sr = length(p - u_c - vec2(u_R * 0.03, u_R * 0.05));
  float shadow = (1.0 - smoothstep(u_R * 0.9, u_R * 1.08, sr)) * u_shade.a;
  vec4 outc = vec4(u_shade.rgb * shadow, shadow);
  float bowl = 1.0 - smoothstep(u_R - aa, u_R + aa, r);
  if (bowl <= 0.0) { o_color = outc; return; }

  vec3 col;
  if (r > u_rimIn) {
    // The rolled rim: a half-round lip, brushed in rings, lit upper left.
    float t = clamp((r - u_rimIn) / (u_R - u_rimIn), 0.0, 1.0);
    vec3 n = normalize(vec3(dir * (2.0 * t - 1.0) * 1.1, 0.35 + sin(PI * t)));
    float diff = max(dot(n, L), 0.0);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float ang = atan(d.y, d.x);
    float brush = kx_noise(vec2(ang * 60.0 + u_seed * 3.1, t * 6.0)) * 0.6 + kx_noise(vec2(ang * 190.0, u_seed)) * 0.4;
    float spec = pow(max(dot(n, H), 0.0), mix(24.0, 70.0, u_shine)) * (0.7 + 0.6 * brush) * (0.4 + 0.9 * u_shine);
    // The glint: a soft bright spot that travels the rim while it sings.
    float dg = atan(sin(ang - u_glintA), cos(ang - u_glintA));
    float g = exp(-dg * dg / 0.035) * sin(PI * t) * u_glint;
    col = u_metal * (0.32 + 0.8 * diff) * (0.92 + 0.16 * brush) + u_hi * (spec + g * 1.2);
    // The mallet, where the keys will strike.
    if (u_mallet.y > 0.5) {
      float dm = atan(sin(ang - u_mallet.x), cos(ang - u_mallet.x));
      float m = exp(-dm * dm / 0.004) * smoothstep(0.15, 0.5, t) * smoothstep(0.95, 0.6, t);
      col = mix(col, vec3(1.0), m * (0.55 + 0.35 * u_mallet.z));
    }
  } else if (r > u_water) {
    // The inner wall curving down to the waterline: lit where it faces the light.
    float t = (r - u_water) / max(u_rimIn - u_water, 1.0);
    float face = dot(-dir, normalize(L.xy));
    col = mix(u_lo, u_metal, 0.35 + 0.45 * t) * (0.55 + 0.5 * max(-face, 0.0) + 0.15 * t);
    float line = exp(-pow((r - u_water) / 1.4, 2.0));
    col += u_hi * line * 0.35;
  } else {
    // The water: its slope from the height field, its focusing from the
    // curvature; the floor shows through, the room reflects off the skin.
    float e = 1.0;
    float h0 = waterH(p);
    float hx1 = waterH(p + vec2(e, 0.0));
    float hx0 = waterH(p - vec2(e, 0.0));
    float hy1 = waterH(p + vec2(0.0, e));
    float hy0 = waterH(p - vec2(0.0, e));
    float amp = u_water * 0.075;
    vec2 slope = vec2(hx1 - hx0, hy1 - hy0) * 0.5 * amp;
    vec3 n = normalize(vec3(-slope, 1.0));
    float lap = (hx1 + hx0 + hy1 + hy0 - 4.0 * h0) * amp;
    float rr = r / u_water;
    vec2 fuv = d / u_water - n.xy * 0.4;
    float hammer = kx_noise(fuv * 9.0 + u_seed) * 0.5 + kx_noise(fuv * 23.0 - u_seed) * 0.5;
    vec3 floorC = u_floor * (0.7 + 0.45 * rr + 0.12 * hammer);
    // Concave crests focus the light onto the floor: the caustic net.
    floorC *= 1.0 + clamp(-lap * 2.4, -0.4, 1.1);
    // The room in the skin of the water: brighter toward the light, so
    // every tilt of the surface shows as light or shade.
    vec2 toward = -normalize(L.xy);
    float sky = 0.03 + 0.26 * smoothstep(-0.8, 0.9, dot(d / u_water * 0.5 + n.xy * 3.4, toward));
    vec2 q = (d / u_water + n.xy * 2.2 - vec2(-0.34, -0.4)) / vec2(0.36, 0.26);
    float win = (1.0 - smoothstep(0.35, 1.0, length(q))) * 0.2;
    float glare = pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 160.0) * 0.9;
    col = floorC * 0.78 + u_sky * (sky + win) + vec3(glare);
    // The inner wall's shadow falls across the near water.
    float shade = smoothstep(0.75, 1.0, rr) * max(dot(-dir, normalize(L.xy)), 0.0);
    col *= 1.0 - 0.32 * shade;
  }
  col = clamp(col, 0.0, 1.0);
  outc = vec4(col, 1.0) * bowl + outc * (1.0 - bowl);
  o_color = outc;
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const RENDER_SCALE = 0.75;
/** Petal orders ease on the drift spring's time scale: a quarter of its natural frequency. */
const ORDER_RATE = Math.sqrt(springs.drift.stiffness / springs.drift.mass) / 4;
const RIM = 0.13;
const WATER = 0.78;

/** The bowl in a box: centre and outer radius, px. */
const fit = (w: number, h: number) => ({
  cx: w / 2,
  cy: h / 2,
  // Room round the bowl for its shadow, so the box never clips it.
  R: Math.max(4, (Math.min(w, h) / 2) * 0.9),
});

type Config = {
  modes: number;
  damping: number;
  sensitivity: number;
  rings: number;
  glint: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Events = {
  level: (energy: number, order: number, rubbing: boolean) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  rub: (rate: number, angle: number | null) => void;
  strike: (x: number, y: number) => void;
  strikeAngle: (angle: number) => void;
  mallet: (angle: number, show: boolean, pressed: boolean) => void;
  geometry: () => { cx: number; cy: number; R: number };
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  events: { current: Events },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let detach: () => void = () => {};
  const size = { w: 0, h: 0 };
  const colours = new Float32Array(18);
  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readCtx = reader.getContext("2d", { willReadFrequently: true });

  let energy = 0;
  let glow = 0;
  let order = 2;
  let rate = 0;
  let rubAngle = 0;
  let rubAt = -1;
  let spin = 0;
  let time = 0;
  let glintA = -2.2;
  let clock = 0;
  const strike = { x: 0, y: 0, age: 9, amp: 0 };
  const mal = { a: -Math.PI / 4, show: false, pressed: false };
  // Reduced motion draws stills; a strike shows one ring for a moment.
  let stillRing = 0;
  let stillTimer = 0;
  // Without a loop nothing notices a hand that stopped: a timer does.
  let restTimer = 0;

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
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

  const rgb = (at: number) => [
    colours[at] ?? 0,
    colours[at + 1] ?? 0,
    colours[at + 2] ?? 0,
  ];

  /** A point on the waterline under the rim at an angle. */
  const ringAt = (angle: number) => {
    const b = fit(size.w, size.h);
    return {
      x: b.cx + Math.cos(angle) * b.R * WATER * 0.97,
      y: b.cy + Math.sin(angle) * b.R * WATER * 0.97,
    };
  };

  const draw = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost || size.w < 1) return;
    const b = fit(size.w, size.h);
    const still = !c.motionSafe;
    const E = still ? 0.62 : energy;
    const n = still ? clamp(Math.round(order), 2, c.modes) : order;
    // Reduced motion's strike: one ring, drawn where the mallet hit.
    const mallet = ringAt(mal.a);
    g.program.set({
      u_res: [size.w, size.h],
      u_c: [b.cx, b.cy],
      u_R: b.R,
      u_rimIn: b.R * (1 - RIM),
      u_water: b.R * WATER,
      u_metal: rgb(0),
      u_hi: rgb(3),
      u_lo: rgb(6),
      u_floor: rgb(9),
      u_sky: rgb(12),
      u_shade: [...rgb(15), 0.2],
      u_time: still ? 0 : time,
      u_energy: E,
      u_order: n,
      u_rings: clamp(c.rings, 2, 8),
      u_spin: spin,
      u_glint: still ? 0.35 * c.glint : glow * clamp(c.glint, 0, 1),
      u_glintA: glintA,
      u_shine: clamp(c.glint, 0, 1),
      u_strike: still
        ? [mallet.x, mallet.y, stillRing ? 0.45 : 9, stillRing ? 0.8 : 0]
        : [strike.x, strike.y, strike.age, strike.amp],
      u_mallet: [mal.a, mal.show ? 1 : 0, mal.pressed ? 1 : 0],
      u_seed: (Math.round(c.seed) % 53) * 0.37,
    });
    g.gl.viewport(0, 0, canvas.width, canvas.height);
    g.gl.clearColor(0, 0, 0, 0);
    g.gl.clear(g.gl.COLOR_BUFFER_BIT);
    g.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const decay = () => lerp(0.16, 1.7, clamp(cfg?.damping ?? 0.4, 0, 1));

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    time += dt;
    // A hand that stopped moving stops rubbing.
    if (clock - rubAt > 0.14) rate *= Math.exp(-dt * 10);
    const rubbing = rate > 0.6;
    const drive = rubbing
      ? clamp(c.sensitivity, 0, 1) * clamp(rate / 7, 0, 1.6) * 1.5
      : 0;
    energy += (drive * (1 - energy) - decay() * energy) * dt;
    // The brass keeps its glint twice as long as the water keeps its song.
    glow += (drive * 0.7 * (1 - glow) - decay() * 0.5 * glow) * dt;
    energy = clamp(energy, 0, 1);
    glow = clamp(glow, 0, 1);
    if (rubbing) {
      // Faster circling climbs to higher orders: petals multiply.
      const target =
        2 + (clamp(c.modes, 2, 8) - 2) * clamp((rate - 1.5) / 9, 0, 1);
      order += (target - order) * (1 - Math.exp(-dt * ORDER_RATE));
      glintA +=
        Math.atan2(Math.sin(rubAngle - glintA), Math.cos(rubAngle - glintA)) *
        (1 - Math.exp(-dt * 8));
    } else {
      glintA += dt * 0.35 * glow;
    }
    spin += dt * 0.12 * Math.sign(rate || 1) * energy;
    if (strike.amp > 0) {
      strike.age += dt;
      if (strike.age > 2.6) strike.amp = 0;
    }
    if (energy < 0.0015 && !rubbing) energy = 0;
    if (glow < 0.03 && energy === 0 && !rubbing) glow = 0;
    events.current.level(energy, order, rubbing);
  };

  const moving = () => {
    const c = cfg;
    if (!c || !c.motionSafe || c.paused) return false;
    return energy > 0 || glow > 0 || strike.amp > 0 || rate > 0.05;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || !gpu) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else {
      last = 0;
      events.current.level(0, order, false);
    }
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
    for (let i = 0; i < 6; i += 1) {
      const el = kids[i];
      if (!el || !readCtx) continue;
      readCtx.clearRect(0, 0, 1, 1);
      readCtx.fillStyle = "rgb(0, 0, 0)";
      readCtx.fillStyle = getComputedStyle(el).color;
      readCtx.fillRect(0, 0, 1, 1);
      const px = readCtx.getImageData(0, 0, 1, 1).data;
      colours[i * 3] = (px[0] ?? 0) / 255;
      colours[i * 3 + 1] = (px[1] ?? 0) / 255;
      colours[i * 3 + 2] = (px[2] ?? 0) / 255;
    }
  };

  const resize = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(g.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? RENDER_SCALE : 1,
    });
    draw();
    kick();
  };

  const start = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  const hit = (x: number, y: number) => {
    const c = cfg;
    if (!c) return;
    if (!c.motionSafe) {
      stillRing = 1;
      window.clearTimeout(stillTimer);
      draw();
      stillTimer = window.setTimeout(() => {
        stillRing = 0;
        draw();
      }, 600);
      return;
    }
    if (c.paused) return;
    strike.x = x;
    strike.y = y;
    strike.age = 0;
    strike.amp = 1;
    energy = Math.min(1, energy + 0.22 * (1 - energy));
    glow = Math.min(1, glow + 0.6);
    const b = fit(size.w, size.h);
    glintA = Math.atan2(y - b.cy, x - b.cx);
    events.current.level(energy, order, false);
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!start()) {
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
      if (!next.motionSafe && was.motionSafe) {
        energy = 0;
        glow = 0;
        strike.amp = 0;
        rate = 0;
      }
      order = clamp(order, 2, clamp(next.modes, 2, 8));
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
    rub(r, angle) {
      const c = cfg;
      if (!c || c.paused) return;
      rate = r;
      rubAt = clock;
      if (angle !== null) rubAngle = angle;
      if (!c.motionSafe) {
        // The still shows the order the rubbing reached.
        const target =
          2 + (clamp(c.modes, 2, 8) - 2) * clamp((r - 1.5) / 9, 0, 1);
        if (Math.round(target) !== Math.round(order)) {
          order = target;
          draw();
        }
        events.current.level(r > 0.6 ? 0.62 : 0, order, r > 0.6);
        window.clearTimeout(restTimer);
        if (r > 0.6)
          restTimer = window.setTimeout(() => {
            if (!disposed) events.current.level(0, order, false);
          }, 300);
        return;
      }
      kick();
    },
    strike: hit,
    strikeAngle(angle) {
      const at = ringAt(angle);
      hit(at.x, at.y);
    },
    mallet(angle, show, pressed) {
      mal.a = angle;
      mal.show = show;
      mal.pressed = pressed;
      if (!moving()) draw();
    },
    geometry: () => fit(size.w, size.h),
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(stillTimer);
      window.clearTimeout(restTimer);
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

/** The server's frame and the fallback: rim, water and a still petal pattern. */
function stillBowl(order: number, rings: number) {
  const C = 50;
  const R = 45;
  const Rw = R * WATER;
  const pts: string[] = [];
  for (let i = 0; i <= 120; i += 1) {
    const a = (i / 120) * Math.PI * 2;
    const rr = Rw * (0.86 + 0.06 * Math.cos(order * a));
    pts.push(`${r2(C + Math.cos(a) * rr)} ${r2(C + Math.sin(a) * rr)}`);
  }
  const ringR = Array.from(
    { length: Math.max(2, Math.min(4, rings - 1)) },
    (_, i) => r2(Rw * (0.72 - i * 0.14)),
  );
  return {
    C,
    R,
    Rw: r2(Rw),
    rimIn: r2(R * (1 - RIM)),
    petals: `M ${pts.join(" L ")} Z`,
    ringR,
  };
}

/**
 * A brass singing bowl full of water, seen from above. Circle the pointer
 * round the rim (hover with a mouse, press and drag with a finger) or hold
 * Space, and the angular speed of your circling feeds energy into the water,
 * which rises into a standing wave — petals at the wall, rings running inward
 * — whose order climbs with the speed, cross-fading so the petals visibly
 * multiply. Stop and the energy drains at the damping rate while the rings let
 * go from the centre out, the last petals dying at the wall, and the rim keeps
 * a soft travelling glint that fades half as fast. A tap on the rim, or
 * Enter at the keyboard's mallet, sends one clean wave across the water.
 *
 * One WebGL2 pass: a brushed, half-round rim, the inner wall, and the water
 * shaded from its height field — slope for the window's reflection, curvature
 * for the caustics on the floor. The loop runs only while the water moves.
 * Under reduced motion, a still patterned surface.
 */
export function SingingBowl({
  modes = 5,
  damping = 0.4,
  metal = "brass",
  sensitivity = 0.5,
  rings = 5,
  glint = 0.6,
  waterColor,
  interactive = true,
  paused = false,
  label = "Singing bowl",
  sound = false,
  onSingingChange,
  onModeChange,
  seed = 2,
  disabled = false,
  dpr = 2,
  className,
}: SingingBowlProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const hum = React.useRef<LoopHandle | null>(null);
  const reported = React.useRef({ singing: false, petals: 0 });
  const hand = React.useRef({ angle: 0, t: 0, rate: 0, on: false });
  const keys = React.useRef({
    space: false,
    since: 0,
    mallet: -Math.PI / 4,
    timer: 0,
  });
  const activated = React.useRef(false);
  const live = !disabled;
  const colours = tones(metal, waterColor);
  const modeCount = Math.round(clamp(modes, 2, 8));

  const config: Config = {
    modes: modeCount,
    damping,
    sensitivity,
    rings,
    glint,
    interactive: interactive && live,
    paused,
    seed,
    dpr,
    motionSafe,
    colorKey: colours.join("|"),
  };
  const latest = React.useRef(config);
  const events = React.useRef<Events>({ level: () => {} });

  React.useLayoutEffect(() => {
    latest.current = config;
    events.current = {
      level: (energy, order, rubbing) => {
        const r = reported.current;
        const singing = r.singing ? energy > 0.05 : energy > 0.09;
        if (singing !== r.singing) {
          r.singing = singing;
          onSingingChange?.(singing);
        }
        const petals = Math.round(order) * 2;
        if (singing && petals !== r.petals) {
          r.petals = petals;
          onModeChange?.(petals);
        }
        // The hum follows the energy and climbs with the order; it starts
        // only from a press, a key or a hover once the page has had one.
        const loop = hum.current;
        if (!sound) return;
        if (!loop && (rubbing || energy > 0.1)) {
          const ok =
            activated.current ||
            (
              navigator as Navigator & {
                userActivation?: { hasBeenActive: boolean };
              }
            ).userActivation?.hasBeenActive === true;
          if (ok) hum.current = audio.start("hum", { gain: 0.05, pitch: 1 });
        } else if (loop && energy < 0.02 && !rubbing) {
          loop.stop();
          hum.current = null;
        } else if (loop) {
          loop.set({
            gain: clamp(energy * 0.7, 0.02, 0.6),
            pitch: 1 + 0.06 * (order - 2),
          });
        }
      },
    };
  });

  React.useEffect(() => {
    engine.current?.configure(latest.current);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, events);
    engine.current = e;
    e.configure(latest.current);
    const k = keys.current;
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      window.clearInterval(k.timer);
      hum.current?.stop();
      hum.current = null;
    };
  }, []);

  // Sound switched off mid-song: the hum goes with it.
  React.useEffect(() => {
    if (sound) return;
    hum.current?.stop();
    hum.current = null;
  }, [sound]);

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
    const onVisibility = () => {
      if (document.hidden) {
        hum.current?.stop();
        hum.current = null;
      } else engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      visible.current = false;
    };
  }, []);

  /** A client point as an angle and a distance from the bowl's centre, in radii. */
  const polar = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const g = engine.current?.geometry();
    if (!root || !g) return null;
    const r = root.getBoundingClientRect();
    const x = clientX - r.left - g.cx;
    const y = clientY - r.top - g.cy;
    return {
      angle: Math.atan2(y, x),
      dist: Math.hypot(x, y) / g.R,
      x: x + g.cx,
      y: y + g.cy,
    };
  };

  /** Circling the rim: the angular speed, smoothed, is the rub. */
  const rubFrom = (clientX: number, clientY: number, t: number) => {
    const at = polar(clientX, clientY);
    if (!at) return;
    const h = hand.current;
    const onRim = at.dist > 0.66 && at.dist < 1.25;
    if (!onRim) {
      h.on = false;
      h.rate *= 0.5;
      engine.current?.rub(h.rate, null);
      return;
    }
    if (h.on && t > h.t) {
      const dt = Math.max(0.008, (t - h.t) / 1000);
      const da = Math.atan2(
        Math.sin(at.angle - h.angle),
        Math.cos(at.angle - h.angle),
      );
      const w = Math.abs(da) / dt;
      h.rate += (Math.min(w, 30) - h.rate) * Math.min(1, dt / 0.12);
    }
    h.on = true;
    h.angle = at.angle;
    h.t = t;
    engine.current?.rub(h.rate, at.angle);
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !live || !interactive,
    onMove: ({ point, event }) => {
      activated.current = true;
      rubFrom(point.x, point.y, event.timeStamp);
    },
    onEnd: () => {
      hand.current.on = false;
    },
    onCancel: () => {
      hand.current.on = false;
    },
    onTap: (event) => {
      activated.current = true;
      const at = polar(event.clientX, event.clientY);
      if (!at || at.dist > 1.05) return;
      engine.current?.strike(at.x, at.y);
    },
  });

  const holdTick = () => {
    const k = keys.current;
    if (!k.space) return;
    const held = (performance.now() - k.since) / 1000;
    const rate = Math.min(12, 2.5 + held * 3.2);
    // The keyboard's mallet circles the rim at the rubbing speed.
    k.mallet = (k.mallet + rate * 0.05) % (Math.PI * 2);
    engine.current?.mallet(k.mallet, true, true);
    engine.current?.rub(rate, k.mallet);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const k = keys.current;
    if (event.key === " ") {
      event.preventDefault();
      activated.current = true;
      if (event.repeat || k.space) return;
      k.space = true;
      k.since = performance.now();
      window.clearInterval(k.timer);
      k.timer = window.setInterval(holdTick, 50);
      holdTick();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activated.current = true;
      engine.current?.mallet(k.mallet, true, true);
      engine.current?.strikeAngle(k.mallet);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const stepSize = ((event.shiftKey ? 45 : 15) * Math.PI) / 180;
      k.mallet += event.key === "ArrowRight" ? stepSize : -stepSize;
      engine.current?.mallet(k.mallet, true, false);
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = keys.current;
    if (event.key === " ") {
      event.preventDefault();
      k.space = false;
      window.clearInterval(k.timer);
      engine.current?.rub(0, null);
      engine.current?.mallet(k.mallet, true, false);
    } else if (event.key === "Enter") {
      engine.current?.mallet(k.mallet, true, false);
    }
  };

  const still = stillBowl(Math.min(4, modeCount), rings);

  return (
    <div
      ref={bindRoot}
      className={cn("group/singing-bowl relative isolate size-56", className)}
    >
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/singing-bowl:opacity-0"
      >
        <defs>
          <radialGradient id={`${uid}-rim`} cx="40%" cy="36%" r="70%">
            <stop offset="0" style={{ stopColor: colours[1] }} />
            <stop offset="0.6" style={{ stopColor: colours[0] }} />
            <stop offset="1" style={{ stopColor: colours[2] }} />
          </radialGradient>
          <radialGradient id={`${uid}-water`} cx="50%" cy="50%" r="50%">
            <stop
              offset="0"
              style={{ stopColor: colours[3] }}
              stopOpacity={0.8}
            />
            <stop offset="1" style={{ stopColor: colours[3] }} />
          </radialGradient>
        </defs>
        <circle
          cx={still.C + 2.5}
          cy={still.C + 4}
          r={still.R}
          style={{ fill: colours[5] }}
          opacity={0.18}
        />
        <circle
          cx={still.C}
          cy={still.C}
          r={still.R}
          fill={`url(#${uid}-rim)`}
        />
        <circle
          cx={still.C}
          cy={still.C}
          r={still.rimIn}
          style={{ fill: colours[2] }}
        />
        <circle
          cx={still.C}
          cy={still.C}
          r={still.Rw}
          fill={`url(#${uid}-water)`}
        />
        <path
          d={still.petals}
          fill="none"
          strokeWidth={0.6}
          strokeOpacity={0.5}
          style={{ stroke: colours[4] }}
        />
        {still.ringR.map((r) => (
          <circle
            key={r}
            cx={still.C}
            cy={still.C}
            r={r}
            fill="none"
            strokeWidth={0.4}
            strokeOpacity={0.3}
            style={{ stroke: colours[4] }}
          />
        ))}
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {colours.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <button
        type="button"
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={!live}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (!live || !interactive || event.pointerType === "touch") return;
          rubFrom(event.clientX, event.clientY, event.timeStamp);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          hand.current.on = false;
          engine.current?.rub(0, null);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible"))
            engine.current?.mallet(keys.current.mallet, true, false);
        }}
        onBlur={() => {
          const k = keys.current;
          if (k.space) {
            k.space = false;
            window.clearInterval(k.timer);
            engine.current?.rub(0, null);
          }
          engine.current?.mallet(k.mallet, false, false);
        }}
        onClick={(event) => {
          // A click with no pointer and no key behind it is assistive
          // technology: strike the rim at the mallet.
          if (event.detail !== 0 || !live) return;
          engine.current?.strikeAngle(keys.current.mallet);
        }}
        className={cn(
          "absolute inset-0 cursor-pointer touch-none rounded-full outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-default",
        )}
      />
      {live ? (
        <p id={hintId} className="sr-only">
          Hold Space to rub the rim, faster the longer you hold; Enter strikes
          it; Left and Right move the mallet round the rim.
        </p>
      ) : null}
    </div>
  );
}
