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
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MarshLightState =
  "wandering" | "shy" | "waiting" | "gone" | "summoned";

export type MarshLightProps = {
  /** Content above the marsh: a headline, links, buttons. It stays fully interactive, and keyboard focus inside it calls the light over. */
  children?: React.ReactNode;
  /** Its polite distance and how briskly it slips away, 0 (tame: 70 px, unhurried) to 1 (timid: 200 px, quick). @default 0.5 */
  shyness?: number;
  /** How thick the smoke curls around it are, 0 (clear air) to 1. @default 0.6 */
  smoke?: number;
  /** The light's hue in degrees: 150 is a pale marsh green, 200 cold blue, 60 a candle's gold. @default 150 */
  hue?: number;
  /** The bright core's radius, px. @default 7 */
  size?: number;
  /** Halo size and brightness, 0 to 1. @default 0.7 */
  glow?: number;
  /** How far and how fast it wanders when left alone, 0 to 1. @default 0.4 */
  drift?: number;
  /** Where the water begins, as a fraction of the height. @default 0.68 */
  waterLine?: number;
  /** Reeds and bulrushes along the water's edge. @default true */
  reeds?: boolean;
  /** Keyboard focus inside the content calls the light to the focused element. @default true */
  summonOnFocus?: boolean;
  /** The pointer, and the arrow keys when the scene has focus, move it; off, it only wanders. @default true */
  interactive?: boolean;
  /** Fires when it is cornered and reappears somewhere else. */
  onVanish?: () => void;
  /** Fires when what it is doing changes: wandering, shy (slipping away), waiting, gone (between vanishing and reappearing) or summoned. */
  onStateChange?: (state: MarshLightState) => void;
  /** Hold the scene still. @default false */
  paused?: boolean;
  /** Seeds its wandering and the reeds. @default 5 */
  seed?: number;
  /** Accessible name. @default "Marsh light" */
  label?: string;
  /** Cap on the canvas's pixel ratio, at most 2 (the soft scene never draws above 1.25). @default 2 */
  dpr?: number;
  /** Sizes the scene. @default "h-52 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** OKLCH to gamma-encoded sRGB in 0–1, for uniforms. */
function oklch(L: number, C: number, h: number): [number, number, number] {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const g = (c: number) => {
    const v = clamp01(c);
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };
  return [g(lin[0] ?? 0), g(lin[1] ?? 0), g(lin[2] ?? 0)];
}

/** Hues along the short arc. */
const mixHue = (a: number, b: number, t: number) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};

/** The scene's colours from the light's hue: the night leans a little toward it, the mist more. */
function paletteOf(hue: number) {
  const h = ((hue % 360) + 360) % 360;
  const sky = mixHue(252, h, 0.12);
  const mist = mixHue(sky, h, 0.3);
  return {
    core: { L: 0.97, C: 0.05, h },
    halo: { L: 0.86, C: 0.13, h },
    skyTop: { L: 0.15, C: 0.03, h: sky },
    skyLow: { L: 0.29, C: 0.035, h: mist },
    deep: { L: 0.11, C: 0.025, h: sky },
  };
}

const css = (c: { L: number; C: number; h: number }, alpha = 1) =>
  `oklch(${r2(c.L)} ${r3(c.C)} ${r2(c.h)}${alpha < 1 ? ` / ${r2(alpha)}` : ""})`;

const REEDS = 16;

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_time;
uniform float u_water;
uniform vec2 u_orb;
uniform vec2 u_trail;
uniform float u_core;
uniform float u_glow;
uniform float u_vis;
uniform float u_mist;
uniform float u_swell;
uniform float u_smoke;
uniform float u_seed;
uniform vec3 u_light;
uniform vec3 u_halo;
uniform vec3 u_skyTop;
uniform vec3 u_skyLow;
uniform vec3 u_deep;
uniform vec4 u_reed[${REEDS}];
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

// The light at a point: x the hot core, y the halo.
vec2 orbLight(vec2 p, vec2 c) {
  float d = length(p - c);
  float r = u_core;
  float R = r * (2.6 + 5.0 * u_glow) * u_swell;
  // A ball of light, not a flat disc: a hard bright centre inside a soft one.
  float core = smoothstep(r, r * 0.15, d) + exp(-(d * d) / (r * r * 3.2)) * 0.45;
  float halo = exp(-(d * d) / (R * R)) * 0.7 + exp(-d / (R * 1.6)) * 0.14;
  return vec2(core, halo) * u_vis;
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Reeds and bulrush heads standing on the water line: 1 inside a stem.
float reeds(vec2 p) {
  float best = 0.0;
  for (int i = 0; i < ${REEDS}; i++) {
    vec4 r = u_reed[i];
    if (r.y <= 0.0) continue;
    if (abs(p.x - r.x) > r.y * 0.7 + 8.0) continue;
    float sway = sin(u_time * 0.7 + r.x * 0.05) * r.y * 0.04;
    vec2 a = vec2(r.x, u_water + 2.0);
    vec2 b = vec2(r.x + r.z * r.y + sway, u_water - r.y);
    float along = clamp((u_water - p.y) / r.y, 0.0, 1.0);
    float d = sdSeg(p, a, b) - r.w * (1.0 - 0.7 * along);
    best = max(best, smoothstep(0.7, -0.3, d));
    if (fract(r.x * 0.137) < 0.4) {
      vec2 dir = normalize(b - a);
      float head = sdSeg(p, b - dir * 13.0, b - dir * 4.0) - r.w * 2.6;
      best = max(best, smoothstep(0.7, -0.3, head));
    }
  }
  return best;
}

vec3 sky(float y) {
  float t = clamp(y / u_water, 0.0, 1.0);
  return mix(u_skyTop, u_skyLow, pow(t, 2.4));
}

void main() {
  vec2 p = v_uv * u_size;
  vec3 col;
  vec2 lit = orbLight(p, u_orb);
  float t = u_time;
  bool nearLine = abs(p.y - u_water) < 64.0;

  if (p.y <= u_water) {
    col = sky(p.y);
    // Faint high haze so the sky is never a flat gradient.
    col += u_skyLow * 0.18 * (kx_fbm(p * vec2(0.004, 0.009) + vec2(t * 0.01, 0.0)) - 0.4);
    if (nearLine) {
      float reed = reeds(p);
      vec3 stem = u_skyTop * 0.55 + u_halo * lit.y * 0.25;
      col = mix(col, stem, reed);
    }
  } else {
    float depth = p.y - u_water;
    float k = depth / max(1.0, u_size.y - u_water);
    float rip = kx_noise(vec2(p.x * 0.03, p.y * 0.34 - t * 0.8)) - 0.5;
    float swell = kx_noise(vec2(p.x * 0.011 + 4.0, p.y * 0.12 + t * 0.35)) - 0.5;
    vec2 q = vec2(p.x + (rip * 5.0 + swell * 9.0) * (0.35 + k), 2.0 * u_water - p.y);
    col = mix(u_deep, sky(q.y) * 0.6, 0.7 - 0.4 * k);
    if (nearLine) {
      float reed = reeds(q);
      col = mix(col, u_skyTop * 0.45, reed * (0.85 - k));
    }
    // The light's reflection: stretched down the water and broken by ripples.
    vec2 rq = vec2(q.x, u_orb.y + (q.y - u_orb.y) * 0.32);
    vec2 refl = orbLight(rq, u_orb);
    float bands = 0.5 + 0.5 * sin(p.y * 1.2 + rip * 10.0 + t * 1.8);
    float height = exp(-(u_water - u_orb.y) / (u_size.y * 0.75));
    col += (u_light * refl.x * 0.7 + u_halo * refl.y * 1.1) * bands * height;
    // A cool sheen along the line where water meets air.
    col += u_skyLow * 0.12 * exp(-depth * 0.18);
  }

  // Low mist lying on the water.
  float band = exp(-pow((p.y - u_water) / 16.0, 2.0));
  if (band > 0.01) {
    float m = kx_fbm(vec2(p.x * 0.007 + t * 0.025, p.y * 0.04 - t * 0.01));
    vec3 mistCol = u_skyLow * 1.35 + u_halo * lit.y * 0.4;
    col = mix(col, mistCol, band * smoothstep(0.35, 0.75, m) * (0.25 + 0.45 * u_smoke));
  }

  // Smoke wound round the light: polar coordinates about its (lagging)
  // centre, turned more the nearer the centre, so the curls wrap it.
  if (u_smoke > 0.001 && u_mist > 0.001) {
    vec2 c = p - u_trail;
    float rr = length(c);
    float env = exp(-rr / (32.0 + 44.0 * u_glow)) * u_mist;
    if (env > 0.01) {
      float ang = atan(c.y, c.x) + 2.4 * exp(-rr / 42.0) * u_mist + t * 0.14;
      vec2 sp = vec2(cos(ang), sin(ang)) * rr + vec2(0.0, t * 8.0);
      vec2 w = vec2(
        kx_fbm(sp * 0.018 + vec2(u_seed, 0.0)),
        kx_fbm(sp * 0.018 + vec2(5.2, 1.3 + u_seed))
      );
      float dens = kx_fbm(sp * 0.012 + w * 2.3 + vec2(0.0, -t * 0.05));
      dens = smoothstep(0.38, 0.82, dens) * env * u_smoke;
      vec3 smokeCol = mix(u_skyLow * 1.5, u_halo, clamp(0.3 + lit.y * 1.1, 0.0, 1.0));
      col = mix(col, smokeCol, clamp(dens * 0.85, 0.0, 1.0));
    }
  }

  col += u_light * lit.x * 1.2 + u_halo * lit.y;
  // A soft vignette, a gentle shoulder for the highlights, and a little
  // dither so the long dark gradients never band.
  vec2 v = v_uv - 0.5;
  col *= 1.0 - 0.32 * dot(v, v);
  col = col / (1.0 + 0.22 * max(col.r, max(col.g, col.b)));
  col += (kx_hash(p + fract(t)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`;

type Config = {
  shyness: number;
  smoke: number;
  hue: number;
  size: number;
  glow: number;
  drift: number;
  waterLine: number;
  reeds: boolean;
  interactive: boolean;
  paused: boolean;
  motionSafe: boolean;
  seed: number;
  dpr: number;
};

type Hooks = {
  vanish: () => void;
  state: (state: MarshLightState) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  pointer: (x: number, y: number, on: boolean) => void;
  hand: (dx: number, dy: number) => { x: number; y: number };
  handOff: () => void;
  summon: (x: number, y: number) => void;
  release: () => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  orbEl: HTMLElement,
  handEl: HTMLElement,
  hooks: Hooks,
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let time = 0;
  const size = { w: 0, h: 0 };

  const orb = { x: 0, y: 0, vx: 0, vy: 0, vis: 1, swell: 1, sv: 0, mist: 1 };
  const trail = { x: 0, y: 0, vx: 0, vy: 0 };
  let mode: "free" | "leaving" | "arriving" = "free";
  let placed = false;
  let corner = 0;
  let state: MarshLightState = "wandering";
  const pointer = { x: 0, y: 0, on: false, still: 0, lx: 0, ly: 0 };
  const hand = { x: 0, y: 0, on: false, still: 0 };
  let summonAt: { x: number; y: number } | null = null;
  let phases = [0, 1, 2, 3];
  let reedData = new Float32Array(REEDS * 4);
  let vanishes = 0;
  const perFrame = {
    u_time: 0,
    u_orb: new Float32Array(2),
    u_trail: new Float32Array(2),
    u_vis: 1,
    u_mist: 1,
    u_swell: 1,
  };

  const bounds = () => {
    const c = cfg;
    const m = clamp((c?.size ?? 7) * 4.2, 18, 44);
    const wl = clamp(c?.waterLine ?? 0.68, 0.35, 0.92) * size.h;
    return {
      x0: m,
      x1: Math.max(m + 1, size.w - m),
      y0: m * 0.75,
      y1: Math.max(m * 0.75 + 1, wl - m * 0.65),
      wl,
    };
  };

  const setState = (next: MarshLightState) => {
    if (next === state) return;
    state = next;
    hooks.state(next);
  };

  const plantReeds = () => {
    const c = cfg;
    if (!c) return;
    const r = lcg(c.seed * 11 + 3);
    reedData = new Float32Array(REEDS * 4);
    if (!c.reeds) return;
    // Two clumps near the ends and a sparse one in between, as a bank grows.
    const clumps = [0.08 + r() * 0.1, 0.42 + r() * 0.16, 0.8 + r() * 0.12];
    for (let i = 0; i < REEDS; i += 1) {
      const clump = clumps[i % 3] ?? 0.5;
      const spreadW = i % 3 === 1 ? 0.05 : 0.08;
      const x = (clump + (r() - 0.5) * spreadW * 2) * size.w;
      const tall =
        (i % 3 === 1 ? 0.55 : 1) *
        (16 + r() * 26) *
        clamp(size.h / 208, 0.75, 1.3);
      reedData[i * 4] = x;
      reedData[i * 4 + 1] = tall;
      reedData[i * 4 + 2] = (r() - 0.5) * 0.35;
      reedData[i * 4 + 3] = 0.7 + r() * 0.5;
    }
  };

  const wanderTarget = (t: number) => {
    const c = cfg;
    const b = bounds();
    const sp = 0.05 + 0.13 * clamp01(c?.drift ?? 0.4);
    const amp = 0.15 + 0.3 * clamp01(c?.drift ?? 0.4);
    const u = t * sp;
    const fx =
      0.5 +
      amp *
        (0.62 * Math.sin(u * 1.3 + (phases[0] ?? 0)) +
          0.38 * Math.sin(u * 2.3 + (phases[1] ?? 0)));
    const fy =
      0.5 +
      amp *
        1.1 *
        (0.6 * Math.sin(u * 1.7 + (phases[2] ?? 0)) +
          0.4 * Math.sin(u * 2.9 + (phases[3] ?? 0)));
    return {
      x: lerp(b.x0, b.x1, clamp01(fx)),
      y: lerp(b.y0, b.y1, clamp01(fy)),
    };
  };

  /** The spot it reappears at: of a few seeded candidates, the one farthest from the hand. */
  const farthest = (fx: number, fy: number) => {
    const c = cfg;
    const b = bounds();
    const r = lcg((c?.seed ?? 5) * 53 + vanishes * 7);
    let best = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    let far = -1;
    for (let i = 0; i < 9; i += 1) {
      const x = lerp(b.x0, b.x1, 0.08 + r() * 0.84);
      const y = lerp(b.y0, b.y1, 0.15 + r() * 0.7);
      const d =
        Math.hypot(x - fx, y - fy) + Math.hypot(x - orb.x, y - orb.y) * 0.25;
      if (d > far) {
        far = d;
        best = { x, y };
      }
    }
    return best;
  };

  const vanish = () => {
    if (mode !== "free") return;
    mode = "leaving";
    corner = 0;
    vanishes += 1;
    setState("gone");
  };

  const threat = () => {
    const c = cfg;
    if (!c?.interactive) return null;
    if (hand.on) return hand;
    if (pointer.on) return pointer;
    return null;
  };

  const steer = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const b = bounds();
    if (!placed) {
      const w0 = wanderTarget(time);
      orb.x = w0.x;
      orb.y = w0.y;
      trail.x = orb.x;
      trail.y = orb.y;
      placed = true;
    }
    if (mode === "leaving") {
      // The core contracts and the halo goes out; the smoke unwinds after it.
      orb.vis = Math.max(0, orb.vis - dt / 0.32);
      orb.mist = Math.max(0, orb.mist - dt / 0.5);
      if (orb.vis <= 0 && orb.mist <= 0.05) {
        const from = threat() ?? orb;
        const at = summonAt ?? farthest(from.x, from.y);
        orb.x = at.x;
        orb.y = at.y;
        orb.vx = 0;
        orb.vy = 0;
        trail.x = at.x;
        trail.y = at.y;
        trail.vx = 0;
        trail.vy = 0;
        mode = "arriving";
        orb.swell = 0.3;
        orb.sv = 0;
        hooks.vanish();
      }
      return;
    }
    if (mode === "arriving") {
      orb.vis = Math.min(1, orb.vis + dt / 0.24);
      orb.mist = Math.min(1, orb.mist + dt / 0.9);
      // It blooms back in: the halo swells past its size once, on snap.
      const sp = springs.snap;
      const steps = Math.max(1, Math.ceil(dt * 240));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        const a =
          (sp.stiffness * (1 - orb.swell) - sp.damping * orb.sv) / sp.mass;
        orb.sv += a * h;
        orb.swell += orb.sv * h;
      }
      if (
        orb.vis >= 1 &&
        Math.abs(1 - orb.swell) < 0.004 &&
        Math.abs(orb.sv) < 0.05
      ) {
        orb.swell = 1;
        orb.sv = 0;
        mode = "free";
        setState(summonAt ? "summoned" : "wandering");
      }
    }
    let tx: number;
    let ty: number;
    let k: number;
    let ax = 0;
    let ay = 0;
    let next: MarshLightState = "wandering";
    const shy = clamp01(c.shyness);
    const near = lerp(70, 200, shy);
    if (summonAt) {
      tx = summonAt.x;
      ty = summonAt.y;
      k = 16;
      next = "summoned";
    } else {
      const w = wanderTarget(time);
      tx = w.x;
      ty = w.y;
      k = 2.4 + 3 * clamp01(c.drift);
      const th = threat();
      if (th) {
        const dx = orb.x - th.x;
        const dy = orb.y - th.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const ux = dx / d;
        const uy = dy / d;
        if (d < near) {
          // Pushed away, harder the closer the hand, and slipping off to the
          // side with more room rather than straight back.
          const push = Math.pow(1 - d / near, 1.4) * lerp(1600, 3400, shy);
          const cx = (b.x0 + b.x1) / 2 - orb.x;
          const cy = (b.y0 + b.y1) / 2 - orb.y;
          const side = -uy * cx + ux * cy >= 0 ? 1 : -1;
          ax += (ux - uy * side * 0.7) * push;
          ay += (uy + ux * side * 0.7) * push;
          tx = orb.x + ux * near * 0.4;
          ty = orb.y + uy * near * 0.4;
          next = "shy";
          // Pressed against the frame with the hand closing in: cornered.
          const out =
            (orb.x <= b.x0 + 3 && ux < -0.2) ||
            (orb.x >= b.x1 - 3 && ux > 0.2) ||
            (orb.y <= b.y0 + 3 && uy < -0.2) ||
            (orb.y >= b.y1 - 3 && uy > 0.2);
          corner =
            out && d < near * 0.85 ? corner + dt : Math.max(0, corner - dt);
          if (corner > 0.3) {
            vanish();
            return;
          }
        } else {
          corner = Math.max(0, corner - dt);
          if (th.still > 0.6 && d < near * 2.2) {
            // The hand has stopped: it waits at a polite distance, edging closer.
            tx = th.x + ux * near * 1.12;
            ty = th.y + uy * near * 1.12;
            k = 1.1;
            next = "waiting";
          }
        }
      }
    }
    // Critically damped toward the target, plus the push: drift's character.
    ax += k * (tx - orb.x) - 2 * Math.sqrt(k) * orb.vx;
    ay += k * (ty - orb.y) - 2 * Math.sqrt(k) * orb.vy;
    orb.vx += ax * dt;
    orb.vy += ay * dt;
    const sp = Math.hypot(orb.vx, orb.vy);
    const cap = lerp(260, 560, shy);
    if (sp > cap) {
      orb.vx *= cap / sp;
      orb.vy *= cap / sp;
    }
    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;
    if (orb.x < b.x0 || orb.x > b.x1) {
      orb.x = clamp(orb.x, b.x0, b.x1);
      orb.vx *= -0.2;
    }
    if (orb.y < b.y0 || orb.y > b.y1) {
      orb.y = clamp(orb.y, b.y0, b.y1);
      orb.vy *= -0.2;
    }
    // The smoke's centre follows on a slower, heavier spring: curls trail it.
    const kt = 3.2;
    trail.vx += (kt * (orb.x - trail.x) - 2 * Math.sqrt(kt) * trail.vx) * dt;
    trail.vy += (kt * (orb.y - trail.y) - 2 * Math.sqrt(kt) * trail.vy) * dt;
    trail.x += trail.vx * dt;
    trail.y += trail.vy * dt;
    if (mode === "free") setState(next);
  };

  /** Reduced motion: no travel; near the hand it fades out and in somewhere else. */
  const stepStill = (dt: number) => {
    const c = cfg;
    if (!c) return false;
    if (!placed) {
      const w0 = summonAt ?? wanderTarget(0);
      orb.x = w0.x;
      orb.y = w0.y;
      trail.x = orb.x;
      trail.y = orb.y;
      placed = true;
    }
    orb.swell = 1;
    if (mode === "leaving") {
      orb.vis = Math.max(0, orb.vis - dt / 0.15);
      orb.mist = orb.vis;
      if (orb.vis <= 0) {
        const from = threat() ?? orb;
        const at = summonAt ?? farthest(from.x, from.y);
        orb.x = at.x;
        orb.y = at.y;
        trail.x = at.x;
        trail.y = at.y;
        mode = "arriving";
        hooks.vanish();
      }
      return true;
    }
    if (mode === "arriving") {
      orb.vis = Math.min(1, orb.vis + dt / 0.15);
      orb.mist = orb.vis;
      if (orb.vis >= 1) {
        mode = "free";
        setState(summonAt ? "summoned" : "wandering");
      }
      return true;
    }
    if (summonAt) {
      if (Math.hypot(orb.x - summonAt.x, orb.y - summonAt.y) > 2) {
        vanish();
        return true;
      }
      setState("summoned");
      return false;
    }
    const th = threat();
    const near = lerp(70, 200, clamp01(c.shyness));
    if (th && Math.hypot(orb.x - th.x, orb.y - th.y) < near) {
      vanish();
      return true;
    }
    setState("wandering");
    return false;
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, lost: false };
    return true;
  };

  const releaseGpu = () => {
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
    const pal = paletteOf(c.hue);
    const v = (x: { L: number; C: number; h: number }) => oklch(x.L, x.C, x.h);
    p.program.set({
      u_size: [size.w, size.h],
      u_water: bounds().wl,
      u_core: clamp(c.size, 2, 24),
      u_glow: clamp01(c.glow),
      u_smoke: clamp01(c.smoke),
      u_seed: (c.seed % 37) * 1.37,
      u_light: v(pal.core),
      u_halo: v(pal.halo),
      u_skyTop: v(pal.skyTop),
      u_skyLow: v(pal.skyLow),
      u_deep: v(pal.deep),
      u_reed: reedData,
    });
  };

  /** The CSS orb: the light when there is no WebGL2, and its place either way. */
  const placeCss = () => {
    const bob = cfg?.motionSafe && !cfg.paused ? Math.sin(time * 1.6) * 2.5 : 0;
    orbEl.style.transform = `translate(${r2(orb.x)}px, ${r2(orb.y + bob)}px) scale(${r3(Math.max(0.01, orb.swell))})`;
    orbEl.style.opacity = String(r3(orb.vis));
    handEl.style.transform = `translate(${r2(hand.x)}px, ${r2(hand.y)}px)`;
    handEl.style.opacity = hand.on ? "1" : "0";
  };

  const draw = () => {
    const c = cfg;
    placeCss();
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const bob = c.motionSafe && !c.paused ? Math.sin(time * 1.6) * 2.5 : 0;
    // One reused set of per-frame uniforms: nothing new is made per frame.
    perFrame.u_time = time;
    perFrame.u_orb[0] = orb.x;
    perFrame.u_orb[1] = orb.y + bob;
    perFrame.u_trail[0] = trail.x;
    perFrame.u_trail[1] = trail.y;
    perFrame.u_vis = orb.vis;
    perFrame.u_mist = orb.mist;
    perFrame.u_swell = Math.max(0.05, orb.swell);
    p.program.set(perFrame);
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    pointer.still += dt;
    hand.still += dt;
    let busy: boolean;
    if (c.paused) busy = false;
    else if (c.motionSafe) {
      time += dt;
      steer(dt);
      busy = true;
    } else busy = stepStill(dt);
    draw();
    if (busy) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const first = size.w < 1;
    const sx = first ? 1 : w / size.w;
    const sy = first ? 1 : h / size.h;
    size.w = w;
    size.h = h;
    if (!first) {
      orb.x *= sx;
      orb.y *= sy;
      trail.x *= sx;
      trail.y *= sy;
    }
    plantReeds();
    const p = gpu;
    if (p && !p.lost) {
      resizeGL(p.gl, canvas, { dprCap: clamp(Math.min(c.dpr, 1.25), 0.5, 2) });
      statics();
    }
    draw();
    kick();
  };

  const startGpu = () => {
    if (!build()) return false;
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        const r = lcg(next.seed);
        phases = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
        time = r() * 40;
        if (!startGpu()) {
          // No WebGL2: the CSS still stays and the CSS orb keeps its manners.
          failed = true;
          root.setAttribute("data-fallback", "");
          resize();
        } else {
          detach = onContextLoss(
            canvas,
            () => {
              if (gpu) gpu.lost = true;
              root.removeAttribute("data-live");
            },
            () => {
              gpu = null;
              if (!disposed && startGpu()) kick();
            },
          );
        }
        kick();
        return;
      }
      if (was.seed !== next.seed) {
        const r = lcg(next.seed);
        phases = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
      }
      if (
        was.seed !== next.seed ||
        was.reeds !== next.reeds ||
        was.waterLine !== next.waterLine ||
        was.size !== next.size
      ) {
        plantReeds();
        const b = bounds();
        orb.x = clamp(orb.x, b.x0, b.x1);
        orb.y = clamp(orb.y, b.y0, b.y1);
      }
      if (was.dpr !== next.dpr) resize();
      if (!next.interactive) {
        pointer.on = false;
        hand.on = false;
      }
      if (!failed) statics();
      draw();
      kick();
    },
    pointer(x, y, on) {
      if (on && Math.hypot(x - pointer.lx, y - pointer.ly) > 1.5) {
        pointer.still = 0;
        pointer.lx = x;
        pointer.ly = y;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.on = on;
      kick();
    },
    hand(dx, dy) {
      const b = bounds();
      if (!hand.on) {
        hand.x = (b.x0 + b.x1) / 2;
        hand.y = b.y1;
        hand.on = true;
      }
      hand.x = clamp(hand.x + dx, 4, size.w - 4);
      hand.y = clamp(hand.y + dy, 4, size.h - 4);
      hand.still = 0;
      draw();
      kick();
      return { x: hand.x, y: hand.y };
    },
    handOff() {
      hand.on = false;
      draw();
      kick();
    },
    summon(x, y) {
      const b = bounds();
      summonAt = { x: clamp(x, b.x0, b.x1), y: clamp(y, b.y0, b.y1) };
      kick();
    },
    release() {
      summonAt = null;
      kick();
    },
    resize,
    setVisible(on) {
      visible = on;
      if (on) kick();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      releaseGpu();
      root.removeAttribute("data-live");
    },
  };
}

const FOCUSABLE =
  "a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex='-1'])";

/**
 * A pale light over a night marsh, keeping just out of reach. A small orb
 * drifts above dark water wrapped in slow curls of smoke: the smoke is wound
 * round it, lit by it, and trails it when it moves, and the water carries its
 * long broken reflection under reeds and a low mist. Reach toward it and it
 * slips away to the side with more room, harder the closer you come; stop,
 * and it waits at a polite distance, edging a little nearer. Corner it
 * against the frame and it goes out — the core contracts, the smoke unwinds —
 * and blooms back in elsewhere, its halo swelling once on the snap spring.
 * Keyboard focus on anything in your content calls it over to light that
 * element.
 *
 * One WebGL2 pass over a fullscreen triangle; the orb is steered in JS on a
 * critically damped spring. When the scene itself has focus the arrow keys
 * move a hand it shies from. Under reduced motion nothing drifts: it fades
 * out and in at a new place instead of travelling.
 */
export function MarshLight({
  children,
  shyness = 0.5,
  smoke = 0.6,
  hue = 150,
  size = 7,
  glow = 0.7,
  drift = 0.4,
  waterLine = 0.68,
  reeds = true,
  summonOnFocus = true,
  interactive = true,
  onVanish,
  onStateChange,
  paused = false,
  seed = 5,
  label = "Marsh light",
  dpr = 2,
  className,
}: MarshLightProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const orbRef = React.useRef<HTMLSpanElement | null>(null);
  const handRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const handlers = React.useRef({ onVanish, onStateChange });
  React.useEffect(() => {
    handlers.current = { onVanish, onStateChange };
  });

  const config: Config = {
    shyness,
    smoke,
    hue,
    size,
    glow,
    drift,
    waterLine,
    reeds,
    interactive,
    paused,
    motionSafe,
    seed,
    dpr,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const orbEl = orbRef.current;
    const handEl = handRef.current;
    if (!root || !canvas || !orbEl || !handEl) return;
    const e = createEngine(root, canvas, orbEl, handEl, {
      vanish: () => {
        setSaid((s) => ({
          n: s.n + 1,
          text: "The light slipped away and reappeared.",
        }));
        handlers.current.onVanish?.();
      },
      state: (next) => handlers.current.onStateChange?.(next),
    });
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    const target = event.target as HTMLElement;
    if (target === root || !summonOnFocus) return;
    if (!target.matches(":focus-visible") || !target.matches(FOCUSABLE)) return;
    const a = root.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    // Beside the element, on whichever side has more air.
    const right = a.right - b.right > b.left - a.left;
    const x = right ? b.right - a.left + 26 : b.left - a.left - 26;
    engine.current?.summon(x, b.top - a.top + b.height / 2);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (event.target === event.currentTarget) engine.current?.handOff();
    if (
      next &&
      event.currentTarget.contains(next) &&
      next !== event.currentTarget
    )
      return;
    engine.current?.release();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    const step = event.shiftKey ? 48 : 22;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[event.key];
    if (!m) return;
    event.preventDefault();
    engine.current?.hand(m[0], m[1]);
  };

  const pal = paletteOf(hue);
  const water = `${r2(clamp(waterLine, 0.35, 0.92) * 100)}%`;
  const still = `linear-gradient(to bottom, ${css(pal.skyTop)}, ${css(pal.skyLow)} ${water}, ${css(pal.deep)} ${water}, ${css(pal.deep)})`;
  const stillOrb = [
    `radial-gradient(circle at 64% 36%, ${css(pal.core)} 0, ${css(pal.halo, 0.8)} 1.6%, ${css(pal.halo, 0.22)} 6%, transparent 18%)`,
    `radial-gradient(ellipse 4% 22% at 64% 84%, ${css(pal.halo, 0.28)}, transparent)`,
  ].join(", ");

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="marsh scene"
      aria-label={label}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerMove={(event) => {
        if (!interactive) return;
        const r = event.currentTarget.getBoundingClientRect();
        engine.current?.pointer(
          event.clientX - r.left,
          event.clientY - r.top,
          true,
        );
      }}
      onPointerLeave={() => engine.current?.pointer(0, 0, false)}
      className={cn(
        "group/marsh-light relative isolate h-52 w-full overflow-clip rounded-3",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {interactive ? (
        <span id={hintId} className="sr-only">
          Move toward the light and it keeps its distance. With the scene
          focused, the arrow keys move your hand.
        </span>
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/marsh-light:opacity-0"
        style={{ backgroundImage: still }}
      />
      {/* The still's light, at rest; without WebGL2 the CSS orb below takes over. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-fallback/marsh-light:opacity-0 group-data-live/marsh-light:opacity-0"
        style={{ backgroundImage: stillOrb }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-live/marsh-light:opacity-100"
      />
      <span
        ref={orbRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 hidden group-data-fallback/marsh-light:block"
        style={{
          width: size * 16,
          height: size * 16,
          margin: -size * 8,
          backgroundImage: `radial-gradient(circle, ${css(pal.core)} 0, ${css(pal.core)} 6%, ${css(pal.halo, 0.55)} 12%, ${css(pal.halo, 0.12)} 34%, transparent 70%)`,
        }}
      />
      <span
        ref={handRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 -mt-3 -ml-3 size-6 rounded-full border border-dashed border-white/60 opacity-0 transition-opacity duration-150"
      />
      {/* The marsh is night in either theme, so its content wears the dark tokens. */}
      {children ? (
        <div className="dark relative z-10 size-full text-foreground">
          {children}
        </div>
      ) : null}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
