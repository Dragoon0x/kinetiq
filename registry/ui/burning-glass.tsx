"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type PingPong,
  type Program,
} from "@/registry/lib/glsl";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BurningGlassImage = {
  /** The image's address. For WebGL it must be same-origin or served with CORS. */
  src: string;
  /** What it shows, for assistive technology and the frame's description. */
  alt: string;
};

export type BurningGlassProps = {
  /** The images, in the order they burn through. @default three drawn travel scenes */
  images?: readonly BurningGlassImage[];
  /** Controlled: the index of the image on top. */
  value?: number;
  /** The image on top at first when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires when a burn has gone all the way through, with the index now on top. */
  onValueChange?: (index: number) => void;
  /** How tightly the glass focuses the sun, 0 (a broad warm glow) to 1 (a hard pin-point that bites fast). @default 0.6 */
  focus?: number;
  /** How quickly a held spot catches and how fast the hole spreads, 0.25 to 2. @default 1 */
  burnRate?: number;
  /** How dark the browning goes and how long a scorch lingers once you move away, 0 to 1. @default 0.5 */
  scorch?: number;
  /** The glass's diameter in px; it shrinks to fit short frames. @default 92 */
  lensSize?: number;
  /** How much smoke rises from hot spots and burning edges, 0 to 1. @default 0.6 */
  smoke?: number;
  /** The glow of embers along the burning edge, any CSS colour. @default a warm pigment from the amber token */
  emberColor?: string;
  /** The smoke, any CSS colour. @default a grey from the ink tokens */
  smokeColor?: string;
  /** The frame's accessible name. @default "Burn through to the next image" */
  label?: string;
  /** Fires as the held spot warms, browns, smokes and catches, and when it settles again. */
  onStageChange?: (stage: BurningGlassStage) => void;
  /** Sizzle while the spot heats and burns. Off unless asked for. @default false */
  sound?: boolean;
  /** Hold everything where it is. @default false */
  paused?: boolean;
  /** Shows the image but takes no input. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the frame; give it a height. @default "h-56 w-full" */
  className?: string;
};

/* ---------------------------------- art ----------------------------------- */

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const svgUrl = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="600" viewBox="0 0 1500 600">${body}</svg>`,
  )}`;

function dunes(): string {
  const ripples = Array.from({ length: 9 }, (_, i) => {
    const y = 470 + i * 13;
    return `<path d="M${120 + i * 40} ${y} C ${500 + i * 10} ${y - 12} ${900 - i * 20} ${y + 10} ${1380 - i * 30} ${y - 4}" fill="none" stroke="rgba(150,96,48,0.28)" stroke-width="2"/>`;
  }).join("");
  const camels = [0, 1, 2]
    .map((i) => {
      const x = 760 + i * 34;
      const y = 300 - i * 3;
      return `<path d="M${x} ${y} q6 -14 12 -2 q4 -10 10 0 l6 -6 l2 4 l-4 4 l0 10 m-26 0 l0 -10 m8 10 l0 -10 m10 10 l0 -10" fill="rgb(70,46,30)" stroke="rgb(70,46,30)" stroke-width="2" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(104,160,212)"/><stop offset="0.55" stop-color="rgb(206,224,234)"/><stop offset="1" stop-color="rgb(248,228,196)"/></linearGradient>
<radialGradient id="g" cx="0.68" cy="0.22" r="0.3"><stop offset="0" stop-color="rgb(255,252,238)"/><stop offset="0.3" stop-color="rgba(255,246,222,0.55)"/><stop offset="1" stop-color="rgba(255,240,214,0)"/></radialGradient>
<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(238,200,146)"/><stop offset="1" stop-color="rgb(214,166,108)"/></linearGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(232,180,118)"/><stop offset="1" stop-color="rgb(196,138,84)"/></linearGradient>
</defs>
<rect width="1500" height="600" fill="url(#s)"/><rect width="1500" height="600" fill="url(#g)"/>
<circle cx="1020" cy="132" r="38" fill="rgb(255,253,244)"/>
<path d="M0 330 C 220 280 420 290 600 322 S 1000 286 1500 312 L1500 600 L0 600 Z" fill="rgb(228,196,150)"/>
<path d="M0 360 C 260 300 520 318 700 300 C 860 286 1080 330 1500 350 L1500 600 L0 600 Z" fill="url(#a)"/>
<path d="M700 300 C 820 318 900 360 930 420 L 1500 420 L1500 600 L700 600 Z" fill="rgba(170,112,64,0.35)"/>
${camels}
<path d="M0 430 C 300 380 600 410 820 440 S 1240 410 1500 430 L1500 600 L0 600 Z" fill="url(#b)"/>
<path d="M820 440 C 900 452 980 500 1000 600 L1500 600 L1500 430 C 1240 410 1000 440 820 440 Z" fill="rgba(150,92,48,0.3)"/>
${ripples}`;
}

function harbour(): string {
  const streaks = Array.from({ length: 14 }, (_, i) => {
    const y = 392 + i * 13;
    const w = 150 - i * 7;
    return `<rect x="${960 - w / 2 + ((i * 37) % 24) - 12}" y="${y}" width="${w}" height="3" rx="1.5" fill="rgba(255,214,170,${r3(0.75 - i * 0.045)})"/>`;
  }).join("");
  // Every number rounded: the art is markup the server and browser must agree on.
  const boat = (x: number, y: number, s: number) => {
    const k = (v: number) => r1(v * s);
    return `<path d="M${x} ${y} l${k(40)} 0 l${k(-8)} ${k(10)} l${k(-26)} 0 Z" fill="rgb(44,38,66)"/><path d="M${r1(x + 20 * s)} ${y} l0 ${k(-52)}" stroke="rgb(44,38,66)" stroke-width="${k(2)}"/><path d="M${r1(x + 21 * s)} ${r1(y - 50 * s)} l0 ${k(44)} l${k(18)} 0 Z" fill="rgb(236,214,206)"/>`;
  };
  return `<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(92,78,140)"/><stop offset="0.45" stop-color="rgb(214,130,146)"/><stop offset="0.66" stop-color="rgb(252,188,148)"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(170,110,140)"/><stop offset="1" stop-color="rgb(46,44,86)"/></linearGradient>
<radialGradient id="l" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="rgba(255,236,190,0.95)"/><stop offset="1" stop-color="rgba(255,226,170,0)"/></radialGradient>
</defs>
<rect width="1500" height="600" fill="url(#s)"/>
<circle cx="960" cy="388" r="62" fill="rgb(255,222,176)"/>
<path d="M0 360 C 200 330 360 350 520 368 L520 390 L0 390 Z" fill="rgb(132,92,134)"/>
<path d="M1100 380 C 1240 340 1380 352 1500 370 L1500 390 L1100 390 Z" fill="rgb(120,86,128)"/>
<rect y="388" width="1500" height="212" fill="url(#w)"/>
${streaks}
<path d="M300 600 L300 420 C 360 380 470 372 560 400 C 620 418 660 470 700 600 Z" fill="rgb(40,34,62)"/>
<rect x="452" y="232" width="34" height="168" fill="rgb(238,230,226)"/>
<rect x="452" y="272" width="34" height="18" fill="rgb(196,74,80)"/><rect x="452" y="326" width="34" height="18" fill="rgb(196,74,80)"/>
<rect x="446" y="214" width="46" height="20" rx="3" fill="rgb(54,46,74)"/>
<circle cx="469" cy="206" r="40" fill="url(#l)"/>
<path d="M469 206 L 760 168 L 760 214 Z" fill="rgba(255,234,190,0.32)"/>
<path d="M458 196 h22 l-11 -12 Z" fill="rgb(54,46,74)"/>
${boat(820, 452, 1)}${boat(1140, 432, 0.7)}${boat(1260, 470, 0.85)}`;
}

function pines(): string {
  const rand = lcg(41);
  const stars = Array.from({ length: 90 }, () => {
    const x = Math.round(rand() * 1500);
    const y = Math.round(rand() * 330);
    const r = r1(0.6 + rand() * 1.4);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(240,244,255,${r3(0.35 + rand() * 0.6)})"/>`;
  }).join("");
  const tree = (x: number, base: number, h: number, fill: string) => {
    const w = h * 0.36;
    const parts: string[] = [];
    for (let k = 0; k < 4; k += 1) {
      const top = base - h + k * h * 0.2;
      const bot = top + h * 0.38;
      const half = w * (0.45 + k * 0.18);
      parts.push(
        `M${r1(x)} ${r1(top)} L${r1(x + half)} ${r1(bot)} L${r1(x - half)} ${r1(bot)} Z`,
      );
    }
    parts.push(`M${r1(x - 3)} ${r1(base - h * 0.2)} h6 v${r1(h * 0.2)} h-6 Z`);
    return `<path d="${parts.join(" ")}" fill="${fill}"/>`;
  };
  const back = Array.from({ length: 22 }, (_, i) => {
    const x = i * 72 + ((i * 29) % 30);
    return tree(
      x,
      470 - ((i * 17) % 26),
      120 + ((i * 41) % 60),
      "rgb(26,36,70)",
    );
  }).join("");
  const front = Array.from({ length: 13 }, (_, i) => {
    const x = i * 124 + ((i * 53) % 50) - 20;
    if (x > 720 && x < 980) return "";
    return tree(x, 600, 190 + ((i * 67) % 90), "rgb(10,14,30)");
  }).join("");
  return `<defs>
<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(10,16,42)"/><stop offset="0.7" stop-color="rgb(34,50,98)"/><stop offset="1" stop-color="rgb(60,72,120)"/></linearGradient>
<radialGradient id="m" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="rgba(220,230,255,0.5)"/><stop offset="1" stop-color="rgba(220,230,255,0)"/></radialGradient>
<radialGradient id="w" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="rgba(255,196,110,0.7)"/><stop offset="1" stop-color="rgba(255,180,90,0)"/></radialGradient>
</defs>
<rect width="1500" height="600" fill="url(#s)"/>${stars}
<circle cx="1110" cy="150" r="90" fill="url(#m)"/>
<circle cx="1110" cy="150" r="34" fill="rgb(236,240,252)"/><circle cx="1124" cy="140" r="30" fill="rgb(20,30,66)" opacity="0.92"/>
<path d="M0 420 L 180 330 L 330 400 L 520 300 L 700 390 L 880 320 L 1060 410 L 1260 330 L 1500 420 L1500 600 L0 600 Z" fill="rgb(30,42,80)"/>
<path d="M0 470 C 300 450 600 480 900 462 S 1300 470 1500 460 L1500 600 L0 600 Z" fill="rgb(20,28,56)"/>
${back}
<rect x="790" y="452" width="110" height="74" fill="rgb(40,30,34)"/><path d="M780 456 L845 412 L910 456 Z" fill="rgb(28,22,28)"/>
<circle cx="828" cy="488" r="44" fill="url(#w)"/><rect x="816" y="476" width="24" height="22" fill="rgb(255,204,124)"/>
${front}
<path d="M0 560 C 400 540 1000 552 1500 548 L1500 600 L0 600 Z" fill="rgb(196,206,232)" opacity="0.18"/>`;
}

export const defaultBurningGlassImages: BurningGlassImage[] = [
  {
    src: svgUrl(dunes()),
    alt: "Dunes at noon: a white sun over ridges of sand and a line of camels.",
  },
  {
    src: svgUrl(harbour()),
    alt: "A harbour at dusk: a lighthouse on a headland, sailboats and a low sun on the water.",
  },
  {
    src: svgUrl(pines()),
    alt: "Pines at night: a crescent moon, stars, and a cabin's lit window among the trees.",
  },
];

/* --------------------------------- shaders -------------------------------- */

const SHARED = /* glsl */ `
uniform vec4 u_holes[4];
uniform float u_holeCount;
uniform float u_aspect;
${GLSL_NOISE}
float fbm3(vec2 p) {
  return kx_noise(p) * 0.55 + kx_noise(p * 2.03 + 7.1) * 0.3 + kx_noise(p * 4.1 - 3.7) * 0.15;
}
// Signed distance to the burnt region: > 0 inside a hole, < 0 outside.
float burnPhi(vec2 uv) {
  vec2 q = vec2(uv.x * u_aspect, uv.y);
  float phi = -10.0;
  for (int i = 0; i < 4; i += 1) {
    if (float(i) >= u_holeCount) break;
    vec4 h = u_holes[i];
    vec2 c = vec2(h.x * u_aspect, h.y);
    float d = length(q - c);
    float n = fbm3(q * 6.0 + h.w * 17.0);
    float n2 = kx_noise(q * 38.0 + h.w * 5.0);
    float edge = h.z * (1.0 + 0.36 * (n - 0.5)) + 0.012 * (n2 - 0.5) * step(0.001, h.z);
    phi = max(phi, edge - d);
  }
  return phi;
}
`;

const SIM = /* glsl */ `
uniform sampler2D u_prev;
uniform vec2 u_texel;
uniform float u_dt;
uniform vec3 u_spot;
uniform float u_sigma;
uniform float u_cool;
uniform float u_fade;
uniform float u_gain;
uniform float u_clear;
in vec2 v_uv;
out vec4 o_color;
${SHARED}
void main() {
  vec4 c = texture(u_prev, v_uv);
  float h0 = c.r * 3.0;
  float l = (texture(u_prev, v_uv + vec2(u_texel.x, 0.0)).r + texture(u_prev, v_uv - vec2(u_texel.x, 0.0)).r
    + texture(u_prev, v_uv + vec2(0.0, u_texel.y)).r + texture(u_prev, v_uv - vec2(0.0, u_texel.y)).r) * 3.0 - 4.0 * h0;
  float heat = h0 + 0.16 * l - u_dt * u_cool * h0;
  vec2 q = vec2((v_uv.x - u_spot.x) * u_aspect, v_uv.y - u_spot.y);
  heat += u_dt * u_spot.z * exp(-dot(q, q) / (u_sigma * u_sigma));
  float phi = burnPhi(v_uv);
  // The burning edge heats the paper just ahead of it.
  heat += u_dt * 2.6 * smoothstep(-0.05, 0.0, phi) * (1.0 - smoothstep(0.0, 0.025, phi));
  heat *= 1.0 - smoothstep(0.02, 0.06, phi);
  float scorch = c.g + u_dt * u_gain * smoothstep(0.3, 1.0, heat)
    - u_dt * u_fade * (1.0 - smoothstep(0.15, 0.45, heat));
  o_color = vec4(clamp(heat / 3.0, 0.0, 1.0), clamp(scorch, 0.0, 1.0), 0.0, 1.0) * (1.0 - u_clear);
}
`;

const SCREEN = /* glsl */ `
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform sampler2D u_heat;
uniform vec4 u_coverA;
uniform vec4 u_coverB;
uniform float u_time;
uniform vec3 u_spot;
uniform float u_lensR;
uniform float u_focus;
uniform float u_glow;
uniform vec3 u_ember;
uniform vec3 u_smokeCol;
uniform float u_smoke;
uniform float u_reveal;
uniform float u_motion;
uniform float u_char;
in vec2 v_uv;
out vec4 o_color;
${SHARED}
void main() {
  vec2 uv = v_uv;
  float phi = burnPhi(uv);
  vec4 hs = texture(u_heat, uv);
  float heat = hs.r * 3.0;
  float scorch = hs.g * u_char;
  vec3 A = texture(u_a, uv * u_coverA.xy + u_coverA.zw).rgb;
  vec3 B = texture(u_b, uv * u_coverB.xy + u_coverB.zw).rgb;
  float lum = dot(A, vec3(0.2126, 0.7152, 0.0722));
  // Paper browns toward sienna, then chars.
  vec3 toasted = vec3(lum) * vec3(0.86, 0.56, 0.32) + vec3(0.06, 0.02, 0.0);
  vec3 col = mix(A, toasted, smoothstep(0.04, 0.5, scorch) * 0.9);
  col = mix(col, vec3(0.07, 0.05, 0.04), smoothstep(0.45, 1.0, scorch));
  // A ring of char just ahead of a burning edge.
  float ahead = smoothstep(-0.05, -0.003, phi) * (1.0 - step(0.0, phi));
  col = mix(col, vec3(0.05, 0.035, 0.03), ahead * 0.92);
  float inside = smoothstep(0.0, 0.004, phi);
  col = mix(col, B, inside);
  // Embers: a glowing band just inside the edge, flickering.
  float band = smoothstep(-0.006, 0.0, phi) * (1.0 - smoothstep(0.0, 0.018, phi));
  float fl = mix(1.0, 0.6 + 0.8 * kx_noise(vec2(uv.x * u_aspect * 70.0, uv.y * 70.0) + u_time * 7.0), u_motion);
  col += u_ember * band * fl * 1.5 + vec3(1.0, 0.9, 0.7) * band * band * fl * 0.5;
  // The held spot glows when it is very hot.
  col += u_ember * smoothstep(1.0, 2.4, heat) * 0.55 * (1.0 - inside);
  // Smoke: hot paper below sends wisps up.
  if (u_smoke > 0.001) {
    float sm = 0.0;
    for (int k = 1; k <= 6; k += 1) {
      float fk = float(k);
      vec2 off = vec2((kx_noise(vec2(uv.y * 9.0 - u_time * 0.7, fk * 3.1)) - 0.5) * 0.035 * fk / u_aspect, 0.03 * fk);
      sm += max(0.0, texture(u_heat, uv + off).r * 3.0 - 0.35) * (1.0 - fk / 7.0);
    }
    float turb = fbm3(vec2(uv.x * u_aspect * 6.0, uv.y * 6.0 + u_time * 0.9));
    sm = clamp(sm * 0.3 * turb, 0.0, 0.8) * u_smoke * (1.0 - inside * 0.6);
    col = mix(col, u_smokeCol, sm);
  }
  // Sunlight through the glass: the lens takes light from its own area and
  // puts it all in one bright point.
  if (u_spot.z > 0.5) {
    vec2 q = vec2((uv.x - u_spot.x) * u_aspect, uv.y - u_spot.y);
    float d = length(q);
    float lens = 1.0 - smoothstep(u_lensR * 0.94, u_lensR, d);
    float sig = mix(0.05, 0.008, u_focus);
    float spot = exp(-d * d / (sig * sig));
    float corona = exp(-d * d / (sig * sig * 10.0));
    col *= mix(1.0, 0.8, lens * (1.0 - corona));
    col += vec3(1.0, 0.95, 0.82) * (spot * mix(0.65, 1.6, u_focus) + corona * 0.16) * (0.85 + 0.3 * u_glow);
  }
  col = mix(col, B, u_reveal);
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* --------------------------------- engine --------------------------------- */

type Hole = { x: number; y: number; t0: number; seed: number };

type Config = {
  focus: number;
  burnRate: number;
  scorch: number;
  smoke: number;
  paused: boolean;
  motionSafe: boolean;
  dpr: number;
  lensSize: number;
  colorKey: string;
};

type Gpu = {
  gl: GLContext;
  sim: Program;
  screen: Program;
  triSim: FullscreenTriangle;
  triScreen: FullscreenTriangle;
  field: PingPong;
  texA: WebGLTexture | null;
  texB: WebGLTexture | null;
  sizeA: { w: number; h: number };
  sizeB: { w: number; h: number };
  lost: boolean;
};

type Events = {
  stage: (stage: Stage) => void;
  caught: () => void;
  through: () => void;
  sound: (heat: number, burning: boolean) => void;
};

export type BurningGlassStage =
  "idle" | "warming" | "browning" | "smoking" | "burning";
type Stage = BurningGlassStage;

type Engine = {
  configure: (cfg: Config) => void;
  setImages: (a: HTMLImageElement | null, b: HTMLImageElement | null) => void;
  setGlass: (
    x: number,
    y: number,
    on: boolean,
    heats: boolean,
    speed: number,
  ) => void;
  hold: (on: boolean) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  reset: () => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
};

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

/** Scale and offset that draw an image "cover" into a frame of the given aspect. */
function cover(imgW: number, imgH: number, aspect: number): number[] {
  const ia = imgW / Math.max(1, imgH);
  if (ia > aspect) {
    const sx = aspect / ia;
    return [sx, 1, (1 - sx) / 2, 0];
  }
  const sy = ia / aspect;
  return [1, sy, 0, (1 - sy) / 2];
}

const SIM_STEP = 1 / 60;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  events: Events,
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let time = 0;
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  const colours = new Float32Array(6);
  const holeData = new Float32Array(16);
  const holes: Hole[] = [];
  let imgA: HTMLImageElement | null = null;
  let imgB: HTMLImageElement | null = null;
  // The glass, in uv, and how hot the spot under it is (the CPU's model).
  const glass = {
    x: 0.5,
    y: 0.5,
    on: false,
    heats: false,
    speed: 0,
    held: false,
  };
  let spotHeat = 0;
  let scorchBound = 0;
  let heatBound = 0;
  let stage: Stage = "idle";
  let reveal = 0;
  let revealing = false;
  let clearNext = true;
  let throughAt = -1;

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const sim = createProgram(gl, FULLSCREEN_VERTEX, SIM);
    const screen = createProgram(gl, FULLSCREEN_VERTEX, SCREEN);
    if (!sim || !screen) return false;
    gpu = {
      gl,
      sim,
      screen,
      triSim: createFullscreenTriangle(gl, sim),
      triScreen: createFullscreenTriangle(gl, screen),
      field: createPingPong(gl, 8, 8, true),
      texA: null,
      texB: null,
      sizeA: { w: 1, h: 1 },
      sizeB: { w: 1, h: 1 },
      lost: false,
    };
    clearNext = true;
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.triSim.dispose();
    g.triScreen.dispose();
    g.sim.dispose();
    g.screen.dispose();
    g.field.dispose();
    if (g.texA) g.gl.deleteTexture(g.texA);
    if (g.texB) g.gl.deleteTexture(g.texB);
  };

  // Images are drawn flat into a canvas before they become textures: an SVG
  // handed straight to WebGL is rasterised and read back on every upload.
  const flat = [
    document.createElement("canvas"),
    document.createElement("canvas"),
  ];
  const flatten = (img: HTMLImageElement, slot: number): TexImageSource => {
    const c = flat[slot];
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return img;
    if (c.width !== img.naturalWidth || c.height !== img.naturalHeight) {
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
    }
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    return c;
  };

  const upload = () => {
    const g = gpu;
    if (!g || g.lost) return;
    try {
      if (imgA && imgA.complete && imgA.naturalWidth) {
        g.texA = uploadTexture(g.gl, flatten(imgA, 0), {}, g.texA);
        g.sizeA = { w: imgA.naturalWidth, h: imgA.naturalHeight };
      }
      if (imgB && imgB.complete && imgB.naturalWidth) {
        g.texB = uploadTexture(g.gl, flatten(imgB, 1), {}, g.texB);
        g.sizeB = { w: imgB.naturalWidth, h: imgB.naturalHeight };
      }
    } catch {
      // A cross-origin image without CORS cannot become a texture: the
      // drawn stills stay, and the burn falls back to a cross-fade.
      failed = true;
      root.setAttribute("data-fallback", "");
      root.removeAttribute("data-live");
    }
  };

  const fieldSize = () => {
    const w = Math.max(16, Math.min(256, Math.round(size.w / 3)));
    const h = Math.max(8, Math.round((w * size.h) / Math.max(1, size.w)));
    return { w, h };
  };

  const holeRadius = (h: Hole) => {
    const c = cfg;
    const rate = clamp(c?.burnRate ?? 1, 0.25, 2);
    const t = Math.max(0, time - h.t0);
    // A slow catch, then the edge runs: the hole accelerates for a second.
    return 0.42 * rate * t * (0.45 + 0.55 * smooth(0, 1.2, t));
  };

  const covered = () => {
    if (!holes.length) return false;
    const aspect = size.w / Math.max(1, size.h);
    for (let gy = 0; gy <= 4; gy += 1) {
      for (let gx = 0; gx <= 12; gx += 1) {
        const x = (gx / 12) * aspect;
        const y = gy / 4;
        let hit = false;
        for (const h of holes) {
          const r = holeRadius(h) * (1 - 0.15) - 0.004;
          if (Math.hypot(x - h.x * aspect, y - h.y) < r) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
    }
    return true;
  };

  const statics = () => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c) return;
    const aspect = size.w / Math.max(1, size.h);
    g.screen.set({
      u_coverA: cover(g.sizeA.w, g.sizeA.h, aspect),
      u_coverB: cover(g.sizeB.w, g.sizeB.h, aspect),
      u_ember: [colours[0] ?? 1, colours[1] ?? 0.6, colours[2] ?? 0.2],
      u_smokeCol: [colours[3] ?? 0.6, colours[4] ?? 0.6, colours[5] ?? 0.6],
    });
  };

  const draw = (dt: number) => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c || size.w < 1 || !g.texA || !g.texB) return;
    const { gl } = g;
    const aspect = size.w / Math.max(1, size.h);
    let n = 0;
    for (const h of holes) {
      if (n >= 4) break;
      holeData[n * 4] = h.x;
      holeData[n * 4 + 1] = h.y;
      holeData[n * 4 + 2] = holeRadius(h);
      holeData[n * 4 + 3] = h.seed;
      n += 1;
    }
    const lensR = (c.lensSize / 2 / Math.max(1, size.h)) * 0.96;
    const focus = clamp01(c.focus);
    const sigma = 0.05 - 0.04 * focus;
    const power =
      (c.motionSafe ? 1 : 0.8) *
      (2.2 + 4.2 * focus) *
      clamp(c.burnRate, 0.25, 2) *
      (glass.held ? 2 : 1);
    const heating =
      glass.on && (glass.heats || glass.held) && !c.paused
        ? 1 - smooth(30, 260, glass.speed)
        : 0;
    // The field steps at a fixed rate, so a fast screen burns no faster.
    acc += c.paused ? 0 : dt;
    const fs = fieldSize();
    if (g.field.read.width !== fs.w || g.field.read.height !== fs.h) {
      g.field.dispose();
      g.field = createPingPong(gl, fs.w, fs.h, true);
      clearNext = true;
    }
    let steps = 0;
    while ((acc >= SIM_STEP || clearNext) && steps < 4) {
      g.sim.use();
      g.sim.set({
        u_texel: [1 / fs.w, 1 / fs.h],
        u_dt: SIM_STEP,
        u_spot: [glass.x, glass.y, power * heating],
        u_sigma: sigma * 1.6,
        u_cool: 0.55,
        u_fade: 0.09 + 0.6 * (1 - clamp01(c.scorch)),
        u_gain: 1.1 + 1.4 * clamp01(c.scorch),
        u_clear: clearNext ? 1 : 0,
        u_aspect: aspect,
        u_holes: holeData,
        u_holeCount: n,
      });
      g.sim.texture("u_prev", g.field.read.texture, 0);
      g.field.write.bind();
      g.triSim.draw();
      g.field.swap();
      clearNext = false;
      acc = Math.max(0, acc - SIM_STEP);
      steps += 1;
    }
    if (steps >= 4) acc = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    g.screen.use();
    g.screen.set({
      u_time: r3(time),
      u_spot: [glass.x, glass.y, glass.on ? 1 : 0],
      u_lensR: lensR,
      u_focus: focus,
      u_glow: clamp01(spotHeat),
      u_smoke: c.motionSafe ? clamp01(c.smoke) : 0,
      u_reveal: reveal,
      u_motion: c.motionSafe ? 1 : 0,
      u_char: 0.55 + 0.45 * clamp01(c.scorch),
      u_aspect: aspect,
      u_holes: holeData,
      u_holeCount: n,
    });
    g.screen.texture("u_a", g.texA, 0);
    g.screen.texture("u_b", g.texB, 1);
    g.screen.texture("u_heat", g.field.read.texture, 2);
    g.triScreen.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const setStage = (next: Stage) => {
    if (next === stage) return;
    stage = next;
    events.stage(next);
  };

  /** The CPU's model of the spot: heat while the glass is slow, cool when it moves. */
  const think = (dt: number) => {
    const c = cfg;
    if (!c) return;
    if (c.paused) {
      events.sound(0, false);
      return;
    }
    const rate = clamp(c.burnRate, 0.25, 2);
    const focus = clamp01(c.focus);
    const heating =
      glass.on && (glass.heats || glass.held)
        ? 1 - smooth(30, 260, glass.speed)
        : 0;
    const gain = (0.32 + 0.5 * focus) * rate * (glass.held ? 3 : 1);
    spotHeat += dt * gain * heating;
    spotHeat -= dt * (heating > 0.5 ? 0.05 : 0.9) * spotHeat;
    spotHeat = Math.max(0, spotHeat);
    heatBound = Math.max(heatBound * Math.exp(-dt * 0.55), heating * 2);
    scorchBound = Math.max(
      scorchBound - dt * (0.09 + 0.6 * (1 - clamp01(c.scorch))),
      spotHeat > 0.3 ? 1 : 0,
    );
    if (holes.length) setStage("burning");
    else if (spotHeat >= 1 && glass.on && failed) {
      // Without WebGL there is no flame to draw: it catches, and the host's
      // still simply gives way to the next image.
      spotHeat = 0;
      glass.held = false;
      events.caught();
      events.through();
      setStage("idle");
    } else if (spotHeat >= 1 && glass.on) {
      // It catches.
      holes.push({
        x: glass.x,
        y: glass.y,
        t0: time,
        seed: (holes.length * 7.31 + time) % 13,
      });
      while (holes.length > 4) holes.shift();
      spotHeat = 0;
      glass.held = false;
      events.caught();
      if (!c.motionSafe) revealing = true;
      setStage("burning");
    } else if (spotHeat > 0.6) setStage("smoking");
    else if (spotHeat > 0.3) setStage("browning");
    else if (spotHeat > 0.06) setStage("warming");
    else setStage("idle");
    events.sound(clamp01(spotHeat), holes.length > 0);
  };

  const finishBurn = () => {
    // The image beneath is now on top: swap the textures at once, so the
    // frame never flashes the old picture while the next one loads.
    const g = gpu;
    if (g && !g.lost) {
      const t = g.texA;
      g.texA = g.texB;
      g.texB = t;
      const z = g.sizeA;
      g.sizeA = g.sizeB;
      g.sizeB = z;
      statics();
    }
    holes.length = 0;
    reveal = 0;
    revealing = false;
    throughAt = -1;
    clearNext = true;
    scorchBound = 0;
    heatBound = 0;
    setStage("idle");
    events.through();
  };

  const busy = () => {
    const c = cfg;
    if (!c) return false;
    if (c.paused) return false;
    return (
      glass.on ||
      holes.length > 0 ||
      revealing ||
      spotHeat > 0.01 ||
      scorchBound > 0.004 ||
      heatBound > 0.01
    );
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!cfg.paused) time += dt;
    think(dt);
    if (revealing && !cfg.motionSafe) {
      reveal = Math.min(1, reveal + dt / 0.4);
      if (reveal >= 1) finishBurn();
    } else if (holes.length && cfg.motionSafe) {
      if (throughAt < 0 && covered()) throughAt = time;
      if (throughAt >= 0 && time - throughAt > 0.35) finishBurn();
    }
    draw(dt);
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 2; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    statics();
  };

  const resize = () => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(g.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? 0.75 : 1,
    });
    statics();
    draw(0);
  };

  const start = () => {
    if (!build()) return false;
    upload();
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
      draw(0);
      kick();
    },
    setImages(a, b) {
      imgA = a;
      imgB = b;
      upload();
      statics();
      draw(0);
    },
    setGlass(x, y, on, heats, speed) {
      glass.x = x;
      glass.y = y;
      glass.on = on;
      glass.heats = heats;
      glass.speed = speed;
      if (!on) glass.held = false;
      kick();
    },
    hold(on) {
      glass.held = on;
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw(0);
    },
    wake() {
      draw(0);
      kick();
    },
    reset() {
      holes.length = 0;
      spotHeat = 0;
      reveal = 0;
      revealing = false;
      throughAt = -1;
      clearNext = true;
      setStage("idle");
      draw(0);
      kick();
    },
    setVisible(on) {
      visible = on;
      // Off screen the loop stops, and so does anything it was sizzling.
      if (!on) events.sound(0, false);
      if (on) kick();
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

/* -------------------------------- component -------------------------------- */

const STAGE_SAID: Partial<Record<Stage, string>> = {
  burning: "Caught. Burning through.",
};

/**
 * A frame of images you burn through with a magnifying glass. Inside the
 * frame the cursor is the glass: the picture under the lens is a little
 * darker, the light it took gathered into one bright point at its centre.
 * Hold it still and the spot browns, smokes, then catches — and a hole opens
 * there and spreads outward on its own along a ragged, glowing edge, with a
 * ring of char running just ahead of it and smoke lifting off, until it has
 * eaten the whole frame and the next image is the one on top. Move away early
 * and only a scorch is left, fading slowly.
 *
 * Heat is a small WebGL2 field that diffuses and cools; the browning and the
 * catch follow the same model on the CPU, so nothing is read back. The frame
 * is a button: arrows move the glass, Enter or Space burns from where it is.
 * Under reduced motion there is no smoke or spreading flame: the spot still
 * browns, and on catching the next image cross-fades in.
 */
export function BurningGlass({
  images = defaultBurningGlassImages,
  value,
  defaultValue = 0,
  onValueChange,
  focus = 0.6,
  burnRate = 1,
  scorch = 0.5,
  lensSize = 92,
  smoke = 0.6,
  emberColor = "oklch(from var(--warn) 0.76 0.17 calc(h - 28))",
  smokeColor = "color-mix(in oklab, var(--ink-3) 70%, white)",
  label = "Burn through to the next image",
  onStageChange,
  sound = false,
  paused = false,
  disabled = false,
  dpr = 2,
  className,
}: BurningGlassProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const count = Math.max(1, images.length);
  const [own, setOwn] = React.useState(
    () => ((Math.round(defaultValue) % count) + count) % count,
  );
  const index = (((value ?? own) % count) + count) % count;
  const next = (index + 1) % count;
  const current = images[index];
  const upcoming = images[next];
  const [, setStage] = React.useState<Stage>("idle");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [glassMode, setGlassMode] = React.useState<
    "off" | "pointer" | "keyboard"
  >("off");
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const [fallbackFade, setFallbackFade] = React.useState(false);

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const lastMove = React.useRef({ x: 0, y: 0, t: 0 });
  const kbd = React.useRef({ x: 0.5, y: 0.5, on: false });
  const loop = React.useRef<LoopHandle | null>(null);
  const gx = useMotionValue(-200);
  const gy = useMotionValue(-200);

  const lens = Math.round(
    Math.min(
      clamp(lensSize, 40, 200),
      (box?.h ?? 224) * 0.55,
      (box?.w ?? 600) * 0.3,
    ),
  );

  const config: Config = {
    focus,
    burnRate,
    scorch,
    smoke,
    paused,
    motionSafe,
    dpr,
    lensSize: lens,
    colorKey: `${emberColor}|${smokeColor}`,
  };
  const latest = React.useRef(config);

  // Everything the engine reports goes through refs, so it never holds a
  // stale closure.
  const handlers = React.useRef<Events>({
    stage: () => {},
    caught: () => {},
    through: () => {},
    sound: () => {},
  });
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
    handlers.current = {
      stage: (s) => {
        setStage(s);
        onStageChange?.(s);
        const text = STAGE_SAID[s];
        if (text) setSaid((v) => ({ n: v.n + 1, text }));
      },
      caught: () => {
        const nav = navigator as Navigator & {
          userActivation?: { hasBeenActive: boolean };
        };
        if (!nav.userActivation || nav.userActivation.hasBeenActive) {
          audio.play("flare", { gain: 0.5, pitch: 0.9 });
        }
      },
      through: () => {
        const to = next;
        const advance = () => {
          if (value === undefined) setOwn(to);
          onValueChange?.(to);
          setSaid((v) => ({
            n: v.n + 1,
            text: `${images[to]?.alt ?? "Next image"}`,
          }));
        };
        if (!rootRef.current?.hasAttribute("data-fallback")) {
          advance();
          return;
        }
        // No WebGL: the still cross-fades to the next before it is on top.
        setFallbackFade(true);
        window.clearTimeout(fadeTimer.current);
        fadeTimer.current = window.setTimeout(() => {
          setFallbackFade(false);
          advance();
        }, 420);
      },
      sound: (heat, burning) => {
        const level = burning ? 0.55 : heat;
        const nav = navigator as Navigator & {
          userActivation?: { hasBeenActive: boolean };
        };
        const allowed = !nav.userActivation || nav.userActivation.hasBeenActive;
        if (!sound || !allowed || level < 0.12) {
          loop.current?.stop();
          loop.current = null;
          return;
        }
        if (!loop.current)
          loop.current = audio.start("sizzle", { gain: 0, pitch: 0.8 });
        loop.current.set({
          gain: Math.min(0.6, level * 0.6),
          pitch: 0.75 + level * 0.5,
        });
      },
    };
  });

  React.useEffect(
    () => () => {
      loop.current?.stop();
      loop.current = null;
    },
    [],
  );

  // The engine: built once the canvas exists, disposed with the component.
  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, {
      stage: (s) => handlers.current.stage(s),
      caught: () => handlers.current.caught(),
      through: () => handlers.current.through(),
      sound: (h, b) => handlers.current.sound(h, b),
    });
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      loop.current?.stop();
      loop.current = null;
    };
  }, []);

  // Images: the one on top and the one beneath, as textures.
  React.useEffect(() => {
    if (!current || !upcoming) return;
    let alive = true;
    const load = (src: string) => {
      const img = new Image();
      if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = src;
      return img;
    };
    const a = load(current.src);
    const b = load(upcoming.src);
    const ready = () => {
      if (!alive || !a.complete || !b.complete) return;
      engine.current?.setImages(a, b);
      engine.current?.reset();
    };
    a.onload = ready;
    b.onload = ready;
    ready();
    return () => {
      alive = false;
      a.onload = null;
      b.onload = null;
    };
  }, [current, upcoming]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
      else {
        loop.current?.stop();
        loop.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLButtonElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setBox({ w: node.clientWidth, h: node.clientHeight });
      engine.current?.resize();
    });
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

  /** Puts the glass at a point of the frame (px) and tells the engine. */
  const placeGlass = (x: number, y: number, on: boolean, speed: number) => {
    const w = rootRef.current?.clientWidth ?? 1;
    const h = rootRef.current?.clientHeight ?? 1;
    gx.set(Math.round(x));
    gy.set(Math.round(y));
    setGlassMode(on ? (kbd.current.on ? "keyboard" : "pointer") : "off");
    // A pointer burns wherever it rests; the keyboard's glass only when held.
    engine.current?.setGlass(
      clamp01(x / w),
      clamp01(y / h),
      on,
      !kbd.current.on,
      speed,
    );
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const r = event.currentTarget.getBoundingClientRect();
    // On touch the glass sits above the finger, so the spot can be seen.
    const lift = event.pointerType === "touch" ? lens * 0.6 : 0;
    const x = event.clientX - r.left;
    const y = event.clientY - r.top - lift;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const prev = lastMove.current;
    const dt = Math.max(8, event.timeStamp - prev.t);
    const speed = prev.t ? (Math.hypot(x - prev.x, y - prev.y) / dt) * 1000 : 0;
    lastMove.current = { x, y, t: event.timeStamp };
    kbd.current.on = false;
    placeGlass(x, y, true, Math.min(speed, 3000));
    // The speed the engine sees decays to rest if the hand stops.
    window.clearTimeout(stillTimer.current);
    stillTimer.current = window.setTimeout(() => placeGlass(x, y, true, 0), 90);
  };
  const stillTimer = React.useRef(0);
  const fadeTimer = React.useRef(0);
  React.useEffect(
    () => () => {
      window.clearTimeout(stillTimer.current);
      window.clearTimeout(fadeTimer.current);
    },
    [],
  );

  const leave = () => {
    window.clearTimeout(stillTimer.current);
    lastMove.current = { x: 0, y: 0, t: 0 };
    if (kbd.current.on) return;
    gx.set(-200);
    gy.set(-200);
    setGlassMode("off");
    engine.current?.setGlass(0.5, 0.5, false, false, 0);
  };

  const keyboardGlass = () => {
    const w = rootRef.current?.clientWidth ?? 1;
    const h = rootRef.current?.clientHeight ?? 1;
    kbd.current.on = true;
    placeGlass(kbd.current.x * w, kbd.current.y * h, true, 0);
  };

  const burnHere = () => {
    if (disabled) return;
    keyboardGlass();
    engine.current?.hold(true);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 0.12 : 0.04;
    // The same distance in px either way: a horizontal step is scaled by the frame's shape.
    const across = step * ((box?.h ?? 1) / Math.max(1, box?.w ?? 1)) * 2;
    const k = kbd.current;
    let moved = true;
    if (event.key === "ArrowLeft") k.x = clamp(k.x - across, 0.04, 0.96);
    else if (event.key === "ArrowRight") k.x = clamp(k.x + across, 0.04, 0.96);
    else if (event.key === "ArrowUp") k.y = clamp(k.y - step, 0.06, 0.94);
    else if (event.key === "ArrowDown") k.y = clamp(k.y + step, 0.06, 0.94);
    else moved = false;
    if (moved) {
      event.preventDefault();
      keyboardGlass();
    }
  };

  const describedBy = `${uid}-desc`;
  const empty = !current;

  return (
    <button
      ref={bindRoot}
      type="button"
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerMove}
      onPointerLeave={leave}
      onPointerCancel={leave}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") leave();
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) keyboardGlass();
      }}
      onBlur={() => {
        kbd.current.on = false;
        leave();
      }}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // Enter, Space or assistive tech: burn from where the glass is.
        if (event.detail === 0) burnHere();
      }}
      className={cn(
        "group/burning-glass relative isolate block h-56 w-full touch-pan-y overflow-clip rounded-3 bg-surface-2 text-left select-none",
        glassMode === "pointer" ? "cursor-none" : "cursor-default",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-not-allowed",
        className,
      )}
    >
      <span id={describedBy} className="sr-only">
        {current?.alt ?? ""} Hold the glass still over a spot to burn through to
        the next image, or press Enter. Arrow keys move the glass.
      </span>
      {/* The stills: the server's frame, the first paint, and the no-WebGL view. */}
      {!empty ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={upcoming?.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current?.src}
            alt=""
            draggable={false}
            className={cn(
              "pointer-events-none absolute inset-0 size-full object-cover transition-opacity",
              fallbackFade
                ? "opacity-0 duration-400"
                : "opacity-100 duration-0",
            )}
          />
        </>
      ) : null}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/burning-glass:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[emberColor, smokeColor].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      {/* The glass itself: a pale lens, a turned rim and a short handle. */}
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-10 transition-opacity duration-150",
          glassMode !== "off" ? "opacity-100" : "opacity-0",
        )}
        style={{ x: gx, y: gy }}
      >
        {/* The lens is 50 units across, centred on the origin; the handle runs off to the lower right. */}
        <svg
          width={Math.round(lens * 1.5)}
          height={Math.round(lens * 1.5)}
          viewBox="-30 -30 75 75"
          className="absolute overflow-visible"
          style={{
            left: -Math.round(lens * 0.6),
            top: -Math.round(lens * 0.6),
          }}
        >
          <g>
            <path
              d="M17.7 17.7 L37 37"
              strokeWidth="7"
              strokeLinecap="round"
              className="stroke-[oklch(0.36_0.05_45)]"
            />
            <path
              d="M15.6 15.6 L19.8 19.8"
              strokeWidth="9"
              strokeLinecap="round"
              className="stroke-[oklch(0.62_0.02_250)]"
            />
            <circle r="25" className="fill-white/6" />
            <circle
              r="25"
              fill="none"
              strokeWidth="2.4"
              className="stroke-[oklch(0.7_0.02_250)]"
            />
            <circle
              r="23.6"
              fill="none"
              strokeWidth="0.6"
              className="stroke-black/30"
            />
            <path
              d="M-16 -12 A 20 20 0 0 1 -4 -19.4"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className="stroke-white/60"
            />
          </g>
        </svg>
      </motion.span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </button>
  );
}
