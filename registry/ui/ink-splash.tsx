"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  bindScreen,
  createFramebuffer,
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  onContextLoss,
  resizeGL,
  supportsHalfFloat,
  type Framebuffer,
  type PingPong,
  type Program,
} from "@/registry/lib/glsl";
import { cascade, durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type InkSplashPalette = "indigo" | "sumi" | "tide" | "ember";
export type InkSplashSource = "pointer" | "keyboard" | "ambient";
export type InkSplashEvent = {
  /** Where the drop landed, in px from the box's top-left. */
  x: number;
  y: number;
  /** A visitor's click, Enter or Space on a control, or the pool's own drip. */
  source: InkSplashSource;
};

export type InkSplashProps = {
  /** Content floated on the pool, such as a headline. It keeps every click, focus and key. */
  children?: React.ReactNode;
  /** How thick the water is, 0 to 1: thin water coasts and curls, thick ink stops short and smooths. @default 0.3 */
  viscosity?: number;
  /** How long ink lingers before the water clears, in seconds (1 to 20). @default 6 */
  fade?: number;
  /** The pigments: a named set from the theme tokens, or your own CSS colours. The brush walks through them, one per stroke and per splash. @default "indigo" */
  colors?: InkSplashPalette | readonly string[];
  /** How strongly eddies are kept and sharpened, 0 to 1 (thick water damps them further). @default 0.5 */
  curl?: number;
  /** The brush's width, in px. @default 22 */
  radius?: number;
  /** How hard the brush pushes the water, 0 to 1. @default 0.6 */
  force?: number;
  /** Coverage of the densest ink, 0 to 1. @default 0.85 */
  opacity?: number;
  /** A click (or Enter/Space on a control inside) drops a splash. @default true */
  splash?: boolean;
  /** The splash drop's radius, in px. @default 46 */
  splashSize?: number;
  /** Satellite droplets that patter down around each splash, 0 to 12. @default 7 */
  droplets?: number;
  /** With nobody stirring, a slow drip lands every few seconds so the pool stays alive. @default true */
  ambient?: boolean;
  /** The pointer stirs the pool (mouse and pen; a tap drops a splash). @default true */
  interactive?: boolean;
  /** Keyboard focus moving between controls inside draws a stroke of ink to the new one. @default true */
  followFocus?: boolean;
  /** Hold the water still and stop the frame loop. @default false */
  paused?: boolean;
  /** The simulation grid's long side, 48 to 192 cells. Lower is cheaper and softer. @default 128 */
  resolution?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Seed for the opening drop, the drips, the droplets, the grain and the still. @default 11 */
  seed?: number;
  /** Fires when a drop lands, with where and why. */
  onSplash?: (splash: InkSplashEvent) => void;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
};

const PALETTES: Record<InkSplashPalette, readonly string[]> = {
  // Each pigment keeps its token's own lightness, so the ink sits deep on the
  // light paper and glows a step brighter in the dark.
  indigo: [
    "oklch(from var(--accent-bright) l 0.19 264)",
    "oklch(from var(--accent-bright) l 0.16 292)",
    "oklch(from var(--accent-bright) l 0.12 226)",
  ],
  sumi: [
    "oklch(from var(--ink) l 0.012 h)",
    "oklch(from var(--ink-2) l 0.02 h)",
    "oklch(from var(--ink) l 0.03 250)",
  ],
  tide: [
    "oklch(from var(--signal) l 0.11 h)",
    "oklch(from var(--accent-bright) l 0.13 222)",
    "oklch(from var(--signal) l 0.08 196)",
  ],
  ember: [
    "oklch(from var(--danger) l 0.19 h)",
    "oklch(from var(--warn) l 0.15 58)",
    "oklch(from var(--danger) l 0.14 352)",
  ],
};

const MAX_SPLATS = 120;
const FIELDS = 9;
const MAX_EVENTS = 48;
const RIPPLES = 4;
const RIPPLE_LIFE = 0.8;

// Every pass shares one vertex stage with texture-space coordinates (y up),
// so a texture written by one pass is read the same way up by the next.
// `layout(location = 0)` lets every program share one fullscreen triangle.
const SIM_VERTEX = /* glsl */ `
layout(location = 0) in vec2 a_position;
uniform vec2 u_texel;
out vec2 v_uv;
out vec2 v_l;
out vec2 v_r;
out vec2 v_t;
out vec2 v_b;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_l = v_uv - vec2(u_texel.x, 0.0);
  v_r = v_uv + vec2(u_texel.x, 0.0);
  v_t = v_uv + vec2(0.0, u_texel.y);
  v_b = v_uv - vec2(0.0, u_texel.y);
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Added into the target with ONE/ONE blending inside a scissor box, so a
// splat costs its own footprint rather than a full-field copy. A velocity
// splat may also carry a volume source in z (see DIVERGENCE).
const SPLAT = /* glsl */ `
precision highp sampler2D;
uniform vec2 u_res;
uniform vec2 u_point;
uniform float u_radius;
uniform float u_ring;
uniform vec3 u_value;
uniform float u_amount;
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec2 d = v_uv * u_res - u_point;
  float x = (length(d) - u_ring) / max(u_radius, 0.5);
  float g = exp(-x * x);
  o_color = vec4(u_value * g, u_amount * g);
}
`;

// Semi-Lagrangian: each cell looks back along the flow for what arrives.
// Anything traced from outside the pool is empty water, never a smear of
// the edge texel; a small four-tap blend is the diffusion.
const ADVECT = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_velocity;
uniform sampler2D u_source;
uniform vec2 u_px2uv;
uniform vec2 u_srcTexel;
uniform float u_dt;
uniform float u_keep;
uniform float u_zKeep;
uniform float u_diffuse;
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec2 vel = texture(u_velocity, v_uv).xy;
  vec2 coord = v_uv - u_dt * vel * u_px2uv;
  vec4 c = texture(u_source, coord);
  if (u_diffuse > 0.0) {
    vec4 n = texture(u_source, coord + vec2(u_srcTexel.x, 0.0))
      + texture(u_source, coord - vec2(u_srcTexel.x, 0.0))
      + texture(u_source, coord + vec2(0.0, u_srcTexel.y))
      + texture(u_source, coord - vec2(0.0, u_srcTexel.y));
    c = mix(c, n * 0.25, u_diffuse);
  }
  vec2 inside = step(vec2(0.0), coord) * step(coord, vec2(1.0));
  o_color = c * u_keep * inside.x * inside.y;
  o_color.z *= u_zKeep;
}
`;

const CURL = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_velocity;
uniform float u_cell;
in vec2 v_uv;
in vec2 v_l;
in vec2 v_r;
in vec2 v_t;
in vec2 v_b;
out vec4 o_color;
void main() {
  float l = texture(u_velocity, v_l).y;
  float r = texture(u_velocity, v_r).y;
  float t = texture(u_velocity, v_t).x;
  float b = texture(u_velocity, v_b).x;
  o_color = vec4(0.5 * ((r - l) - (t - b)) / u_cell, 0.0, 0.0, 1.0);
}
`;

// Vorticity confinement: numerical dissipation rounds eddies off, so a small
// force along the curl's own gradient spins them back up. It is what lets
// ink peel into curls instead of smearing.
const VORTICITY = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_velocity;
uniform sampler2D u_curl;
uniform float u_strength;
uniform float u_dt;
in vec2 v_uv;
in vec2 v_l;
in vec2 v_r;
in vec2 v_t;
in vec2 v_b;
out vec4 o_color;
void main() {
  float l = abs(texture(u_curl, v_l).x);
  float r = abs(texture(u_curl, v_r).x);
  float t = abs(texture(u_curl, v_t).x);
  float b = abs(texture(u_curl, v_b).x);
  float c = texture(u_curl, v_uv).x;
  vec2 grad = 0.5 * vec2(r - l, t - b);
  vec2 n = grad / (length(grad) + 1e-5);
  vec2 force = u_strength * c * vec2(n.y, -n.x);
  vec4 here = texture(u_velocity, v_uv);
  vec2 vel = here.xy + force * u_dt;
  o_color = vec4(clamp(vel, vec2(-4000.0), vec2(4000.0)), here.z, 1.0);
}
`;

// The pool's walls: a velocity outside reflects the one inside, so nothing
// flows through the edge. The velocity's z holds a volume source: the
// projection then leaves a flow whose divergence IS that source instead of
// erasing it, which is how a drop can push water outward in an
// incompressible pool. Each source is zero-mean (a core with a wider,
// shallower sink round it), so the closed pool stays solvable.
const DIVERGENCE = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_velocity;
uniform float u_cell;
in vec2 v_uv;
in vec2 v_l;
in vec2 v_r;
in vec2 v_t;
in vec2 v_b;
out vec4 o_color;
void main() {
  vec4 here = texture(u_velocity, v_uv);
  vec2 c = here.xy;
  float l = v_l.x < 0.0 ? -c.x : texture(u_velocity, v_l).x;
  float r = v_r.x > 1.0 ? -c.x : texture(u_velocity, v_r).x;
  float t = v_t.y > 1.0 ? -c.y : texture(u_velocity, v_t).y;
  float b = v_b.y < 0.0 ? -c.y : texture(u_velocity, v_b).y;
  o_color = vec4(0.5 * (r - l + t - b) / u_cell - here.z, 0.0, 0.0, 1.0);
}
`;

const PRESSURE = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform float u_cell;
in vec2 v_uv;
in vec2 v_l;
in vec2 v_r;
in vec2 v_t;
in vec2 v_b;
out vec4 o_color;
void main() {
  float l = texture(u_pressure, v_l).x;
  float r = texture(u_pressure, v_r).x;
  float t = texture(u_pressure, v_t).x;
  float b = texture(u_pressure, v_b).x;
  float div = texture(u_divergence, v_uv).x;
  o_color = vec4(0.25 * (l + r + t + b - div * u_cell * u_cell), 0.0, 0.0, 1.0);
}
`;

const GRADIENT = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform float u_cell;
in vec2 v_uv;
in vec2 v_l;
in vec2 v_r;
in vec2 v_t;
in vec2 v_b;
out vec4 o_color;
void main() {
  float l = texture(u_pressure, v_l).x;
  float r = texture(u_pressure, v_r).x;
  float t = texture(u_pressure, v_t).x;
  float b = texture(u_pressure, v_b).x;
  vec4 here = texture(u_velocity, v_uv);
  vec2 vel = here.xy - 0.5 * vec2(r - l, t - b) / u_cell;
  o_color = vec4(vel, here.z, 1.0);
}
`;

const SCALE = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_source;
uniform float u_scale;
in vec2 v_uv;
out vec4 o_color;
void main() {
  o_color = texture(u_source, v_uv) * u_scale;
}
`;

const DISPLAY = /* glsl */ `
precision highp sampler2D;
uniform sampler2D u_dye;
uniform vec2 u_res;
uniform vec2 u_dyeTexel;
uniform vec2 u_dyePx;
uniform float u_opacity;
uniform float u_dark;
uniform vec3 u_line;
uniform vec4 u_ripples[${RIPPLES}];
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;

float grainHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + u_seed) * 43758.5453);
}

void main() {
  vec2 px = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  vec2 uv = v_uv;
  float crest = 0.0;
  for (int i = 0; i < ${RIPPLES}; i += 1) {
    vec4 rp = u_ripples[i];
    if (rp.w <= 0.0) continue;
    vec2 d = px - rp.xy;
    float len = length(d);
    float x = (len - (14.0 + 440.0 * rp.z)) / 11.0;
    float ring = exp(-x * x) * rp.w;
    // A travelling ripple is a lens: its front pushes the ink under it
    // outward and its back pulls it in, the ring's own slope.
    vec2 dir = len > 0.001 ? d / len : vec2(0.0);
    vec2 shift = dir * (-x * ring * 5.0);
    uv += vec2(shift.x, -shift.y) / u_res;
    crest += ring * clamp(0.6 - 0.4 * x, 0.0, 1.0);
  }
  vec4 dye = texture(u_dye, uv);
  float density = max(dye.a, 0.0);
  vec3 ink = density > 0.0005 ? clamp(dye.rgb / density, 0.0, 1.0) : vec3(0.0);
  // Ink pools at its own edge as it spreads: where density falls off
  // steeply the colour deepens on paper and catches light in the dark.
  float dl = texture(u_dye, uv - vec2(u_dyeTexel.x, 0.0)).a;
  float dr = texture(u_dye, uv + vec2(u_dyeTexel.x, 0.0)).a;
  float db = texture(u_dye, uv - vec2(0.0, u_dyeTexel.y)).a;
  float dt = texture(u_dye, uv + vec2(0.0, u_dyeTexel.y)).a;
  vec2 slope = vec2(dr - dl, dt - db) / (2.0 * u_dyePx);
  float rim = smoothstep(0.012, 0.07, length(slope)) * smoothstep(0.03, 0.3, density);
  float cover = 1.0 - exp(-density * 2.4);
  // Granulation fixed to the paper, never animated: pigment settles into
  // the tooth, it does not shimmer.
  float grain = grainHash(floor(gl_FragCoord.xy));
  cover *= 0.86 + 0.14 * grain;
  vec3 col = mix(ink * (1.0 - 0.34 * rim), mix(ink, vec3(1.0), 0.22 * rim), u_dark);
  float a = clamp((cover + rim * 0.12) * u_opacity, 0.0, 1.0);
  vec4 inkLayer = vec4(col * a, a);
  float ca = clamp(crest, 0.0, 1.0) * mix(0.1, 0.16, u_dark);
  o_color = vec4(u_line * ca, ca) + inkLayer * (1.0 - ca);
}
`;

type Rgb = [number, number, number];

type Pending = {
  live: boolean;
  at: number;
  x: number;
  y: number;
  size: number;
  tone: number;
  kind: 0 | 1;
};

type Blot = { id: number; x: number; y: number; size: number; color: string };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Number(v.toFixed(1));
const r3 = (v: number) => Number(v.toFixed(3));

const hash = (i: number, seed: number) => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The designed still: soft washes of each pigment, curled by a fixed
 * turbulence displacement (seeded), with one splash and its droplets landed
 * clear of them. Drawn once; kept inside the middle band of its 400 × 200
 * box, which every crop of it shows.
 */
function InkStill({
  palette,
  seed,
  id,
}: {
  palette: readonly string[];
  seed: number;
  id: string;
}) {
  const j = (i: number, span: number) => r1((hash(i, seed) - 0.5) * span);
  const washes = [
    {
      d: `M ${110 + j(1, 20)} ${150 + j(2, 16)} C ${170 + j(3, 30)} ${92 + j(4, 20)}, ${225 + j(5, 30)} ${158 + j(6, 20)}, ${282 + j(7, 20)} ${108 + j(8, 16)} S ${352 + j(9, 16)} ${70 + j(10, 16)}, ${330 + j(11, 16)} ${122 + j(12, 16)}`,
      width: 30,
      tone: 0,
    },
    {
      d: `M ${196 + j(13, 20)} ${66 + j(14, 12)} C ${236 + j(15, 20)} ${46 + j(16, 12)}, ${292 + j(17, 20)} ${54 + j(18, 12)}, ${318 + j(19, 16)} ${88 + j(20, 12)}`,
      width: 16,
      tone: 1,
    },
    {
      d: `M ${232 + j(21, 20)} ${132 + j(22, 10)} C ${256 + j(23, 16)} ${146 + j(24, 10)}, ${286 + j(25, 16)} ${142 + j(26, 10)}, ${300 + j(27, 12)} ${126 + j(28, 10)}`,
      width: 22,
      tone: 2,
    },
  ];
  const bx = r1(150 + hash(41, seed) * 36);
  const by = r1(72 + hash(42, seed) * 14);
  const drops = Array.from({ length: 7 }, (_, k) => {
    const a = ((k + hash(50 + k, seed) * 0.7) / 7) * Math.PI * 2;
    const d = 22 + hash(60 + k, seed) * 14;
    return {
      cx: r1(bx + Math.cos(a) * d),
      cy: r1(by + Math.sin(a) * d * 0.8),
      r: r1(1.4 + hash(70 + k, seed) * 2.4),
    };
  });
  const tone = (i: number) => palette[i % Math.max(1, palette.length)] ?? "";
  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <filter id={`${id}-curl`} x="-20%" y="-30%" width="140%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.021"
            numOctaves={3}
            seed={Math.round(hash(80, seed) * 1000)}
            result="flow"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="flow"
            scale={48}
            xChannelSelector="R"
            yChannelSelector="G"
            result="curled"
          />
          <feGaussianBlur in="curled" stdDeviation="1.4" />
        </filter>
        <filter id={`${id}-wash`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g filter={`url(#${id}-curl)`} fill="none" strokeLinecap="round">
        {washes.map((wash, i) => (
          <g key={i} style={{ stroke: tone(wash.tone) }}>
            <path
              d={wash.d}
              strokeWidth={wash.width * 1.6}
              opacity={0.16}
              filter={`url(#${id}-wash)`}
            />
            <path d={wash.d} strokeWidth={wash.width} opacity={0.34} />
            <path d={wash.d} strokeWidth={wash.width * 0.28} opacity={0.3} />
          </g>
        ))}
      </g>
      <g style={{ fill: tone(1) }}>
        <circle
          cx={bx}
          cy={by}
          r={17}
          opacity={0.22}
          filter={`url(#${id}-wash)`}
        />
        <circle cx={bx} cy={by} r={11} opacity={0.42} />
        {drops.map((drop, k) => (
          <circle key={k} cx={drop.cx} cy={drop.cy} r={drop.r} opacity={0.5} />
        ))}
      </g>
      <circle
        cx={bx}
        cy={by}
        r={11}
        fill="none"
        strokeWidth={1.2}
        opacity={0.32}
        style={{ stroke: tone(0) }}
      />
    </svg>
  );
}

/**
 * A shallow pool of water under the content, simulated on the GPU as a real
 * incompressible fluid: every frame the velocity is advected, its eddies are
 * kept by vorticity confinement, its divergence is solved away with a
 * warm-started Jacobi pressure pass, and the dye rides it. The pointer is a
 * brush dragged through the water — it pushes, and it lays pigment along
 * the stroke — so ink is shoved ahead, peels into curls and slowly diffuses
 * before it fades. A click drops a splash: a radial shove pushes a ring out
 * from the drop, its ink blooms, satellite droplets patter down around it on
 * a `cascade()` stagger, and a surface ripple runs out, bending the ink under
 * it. Light theme: ink on paper with a darker pooled rim; dark theme: the
 * same pigments a step brighter.
 *
 * Keyboard focus moving between controls inside draws a stroke of ink to the
 * newly focused one, and Enter or Space on a control drops a splash there.
 * Without WebGL2 (or renderable half-float), or after a lost context, the
 * server-rendered still swirl stays. Under reduced motion there is no
 * simulation: the still stays, and a click or Enter/Space crossfades a soft
 * blot in at the point and lets it fade.
 */
export function InkSplash({
  children,
  viscosity = 0.3,
  fade = 6,
  colors = "indigo",
  curl = 0.5,
  radius = 22,
  force = 0.6,
  opacity = 0.85,
  splash = true,
  splashSize = 46,
  droplets = 7,
  ambient = true,
  interactive = true,
  followFocus = true,
  paused = false,
  resolution = 128,
  dpr = 2,
  seed = 11,
  onSplash,
  className,
}: InkSplashProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [blots, setBlots] = React.useState<Blot[]>([]);
  const blotCount = React.useRef(0);
  const api = React.useRef<{
    recolour: () => void;
    resize: () => void;
    wake: () => void;
  } | null>(null);

  const palette: readonly string[] =
    typeof colors === "string"
      ? (PALETTES[colors as InkSplashPalette] ?? PALETTES.indigo)
      : colors.length > 0
        ? colors
        : PALETTES.indigo;
  const paletteKey = palette.join("|");
  const fadeSeconds = clamp(fade, 1, 20);

  const params = React.useRef({
    viscosity,
    fadeSeconds,
    curl,
    radius,
    force,
    opacity,
    splash,
    splashSize,
    droplets,
    ambient,
    interactive,
    followFocus,
    paused,
    resolution,
    dpr,
    onSplash,
    palette,
  });
  React.useEffect(() => {
    params.current = {
      viscosity,
      fadeSeconds,
      curl,
      radius,
      force,
      opacity,
      splash,
      splashSize,
      droplets,
      ambient,
      interactive,
      followFocus,
      paused,
      resolution,
      dpr,
      onSplash,
      palette,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || failed || !motionSafe) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    // The solver needs signed, filterable float buffers; without them the
    // still is the designed fallback, and nothing else is set up.
    if (!gl || !supportsHalfFloat(gl)) return;
    const make = (fragment: string) => createProgram(gl, SIM_VERTEX, fragment);
    const splatP = make(SPLAT);
    const advectP = make(ADVECT);
    const curlP = make(CURL);
    const vortP = make(VORTICITY);
    const divP = make(DIVERGENCE);
    const presP = make(PRESSURE);
    const gradP = make(GRADIENT);
    const scaleP = make(SCALE);
    const showP = make(DISPLAY);
    const programs = [
      splatP,
      advectP,
      curlP,
      vortP,
      divP,
      presP,
      gradP,
      scaleP,
      showP,
    ];
    if (
      !splatP ||
      !advectP ||
      !curlP ||
      !vortP ||
      !divP ||
      !presP ||
      !gradP ||
      !scaleP ||
      !showP
    ) {
      for (const p of programs) p?.dispose();
      return;
    }
    const tri = createFullscreenTriangle(gl, splatP);

    // Direct uniform writes: no object per call, nothing allocated a frame.
    const f1 = (p: Program, name: string, v: number) => {
      const at = p.uniforms[name];
      if (at) gl.uniform1f(at, v);
    };
    const f2 = (p: Program, name: string, x: number, y: number) => {
      const at = p.uniforms[name];
      if (at) gl.uniform2f(at, x, y);
    };
    const f3 = (p: Program, name: string, x: number, y: number, z: number) => {
      const at = p.uniforms[name];
      if (at) gl.uniform3f(at, x, y, z);
    };

    let vel: PingPong | null = null;
    let dye: PingPong | null = null;
    let pressure: PingPong | null = null;
    let divergence: Framebuffer | null = null;
    let curlFb: Framebuffer | null = null;
    let sw = 0;
    let sh = 0;
    let dw = 0;
    let dh = 0;
    let w = 0;
    let h = 0;
    let cell = 1;

    let colours: Rgb[] = [];
    let dark = 0;
    let line: Rgb = [0, 0, 0];

    const queue = new Float32Array(MAX_SPLATS * FIELDS);
    let queued = 0;
    const pending: Pending[] = Array.from({ length: MAX_EVENTS }, () => ({
      live: false,
      at: 0,
      x: 0,
      y: 0,
      size: 0,
      tone: 0,
      kind: 0,
    }));
    const rippleData = new Float32Array(RIPPLES * 4);
    const rippleStart = new Float64Array(RIPPLES).fill(-10);
    const rippleStrength = new Float32Array(RIPPLES);
    const rippleAt = new Float32Array(RIPPLES * 2);

    let raf = 0;
    let readyFrame = 0;
    let readyTimer = 0;
    let last = 0;
    let carry = 0;
    let inView = false;
    let lost = false;
    let opened = false;
    let shown = false;
    let tone = Math.floor(hash(3, seed) * 3);
    let travel = 0;
    let splashes = 0;
    let drips = 0;
    let lastVisitor = -10;
    let activeUntil = 0;
    let nextDrip = 0;
    const brush = { x: 0, y: 0, t: -10, vx: 0, vy: 0, has: false };
    const auto = {
      active: false,
      t0: 0,
      duration: 0.36,
      ax: 0,
      ay: 0,
      cx: 0,
      cy: 0,
      bx: 0,
      by: 0,
      lx: 0,
      ly: 0,
      lt: 0,
      thenSplash: false,
    };
    let focusPoint: { x: number; y: number } | null = null;

    const nowS = () => performance.now() / 1000;
    const damping = () =>
      0.22 + 4 * Math.pow(clamp(params.current.viscosity, 0, 1), 1.5);
    const settleFor = () =>
      Math.max(3 / damping(), params.current.fadeSeconds) + 1;
    const markActive = (now: number) => {
      activeUntil = Math.max(activeUntil, now + settleFor());
    };

    // Colours are resolved on a probe inside the component, through a 1 × 1
    // canvas, so any CSS colour (oklch, relative colour, var()) becomes sRGB.
    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const rgba = (css: string): [number, number, number, number] => {
      const probe = probeRef.current;
      if (!probe || !reader) return [0.5, 0.5, 0.5, 1];
      probe.style.color = css;
      const resolved = getComputedStyle(probe).color;
      reader.clearRect(0, 0, 1, 1);
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = resolved;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return [
        (d[0] ?? 128) / 255,
        (d[1] ?? 128) / 255,
        (d[2] ?? 128) / 255,
        (d[3] ?? 255) / 255,
      ];
    };
    const recolour = () => {
      colours = params.current.palette.map((c) => {
        const v = rgba(c);
        return [v[0], v[1], v[2]];
      });
      // Paper or night: the first opaque background behind the pool.
      let node: HTMLElement | null = root;
      let paper: [number, number, number, number] = [1, 1, 1, 1];
      while (node) {
        const v = rgba(getComputedStyle(node).backgroundColor);
        if (v[3] > 0.5) {
          paper = v;
          break;
        }
        node = node.parentElement;
      }
      const luma = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
      dark = luma < 0.5 ? 1 : 0;
      const ink = rgba("var(--ink)");
      line = [ink[0], ink[1], ink[2]];
    };

    const colourAt = (index: number, out: Rgb) => {
      const n = Math.max(1, colours.length);
      const a = colours[((index % n) + n) % n] ?? [0.3, 0.35, 0.8];
      out[0] = a[0];
      out[1] = a[1];
      out[2] = a[2];
      return out;
    };
    const mixed: Rgb = [0, 0, 0];
    const strokeColour = () => {
      // Along a long stroke the brush walks into the next pigment.
      const n = Math.max(1, colours.length);
      const f = clamp(travel / 900, 0, 1);
      const a = colours[tone % n] ?? [0.3, 0.35, 0.8];
      const b = colours[(tone + 1) % n] ?? a;
      mixed[0] = a[0] + (b[0] - a[0]) * f;
      mixed[1] = a[1] + (b[1] - a[1]) * f;
      mixed[2] = a[2] + (b[2] - a[2]) * f;
      return mixed;
    };
    const nextTone = () => {
      if (travel > 450) tone += 1;
      tone += 1;
      travel = 0;
    };

    const push = (
      kind: number,
      x: number,
      y: number,
      rad: number,
      ring: number,
      v0: number,
      v1: number,
      v2: number,
      amount: number,
    ) => {
      if (queued >= MAX_SPLATS) return;
      const o = queued * FIELDS;
      queue[o] = kind;
      queue[o + 1] = x;
      queue[o + 2] = y;
      queue[o + 3] = rad;
      queue[o + 4] = ring;
      queue[o + 5] = v0;
      queue[o + 6] = v1;
      queue[o + 7] = v2;
      queue[o + 8] = amount;
      queued += 1;
    };

    /** A brush stroke from a to b at velocity (vx, vy) px/s, in box px. */
    const stroke = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      vx: number,
      vy: number,
    ) => {
      const p = params.current;
      const dist = Math.hypot(bx - ax, by - ay);
      if (dist < 0.5) return;
      const r = Math.max(4, p.radius);
      const n = clamp(Math.ceil(dist / (r * 0.45)), 1, 10);
      const speed = Math.hypot(vx, vy);
      const k = speed > 2400 ? 2400 / speed : 1;
      const thick = clamp(p.viscosity, 0, 1);
      // Thin water carries the shove further than the brush is wide.
      const reach = r * (1.05 + 0.55 * (1 - thick));
      const spacing = dist / n;
      // Overlapping gaussians along a stroke sum to about reach·√π / spacing,
      // so each one carries only its share: a stroke moves the water at
      // about the brush's own speed, however finely it is sampled.
      const share = Math.min(1, spacing / (reach * 1.77));
      const gain =
        (0.6 + clamp(p.force, 0, 1) * 1.6) * (1 - 0.35 * thick) * share;
      const ink = clamp(spacing / r, 0.04, 0.6) * 0.7;
      travel += dist;
      const c = strokeColour();
      for (let j = 1; j <= n; j += 1) {
        const f = j / n;
        const x = ax + (bx - ax) * f;
        const y = ay + (by - ay) * f;
        push(0, x, y, reach, 0, vx * k * gain, vy * k * gain, 0, 0);
        push(2, x, y, r * 0.55, 0, c[0], c[1], c[2], ink);
      }
    };

    /**
     * A drop's push: a volume source of radius `sigma` whose outflow runs at
     * about `speed` px/s at its rim, with a sink twice as wide and a quarter
     * as deep round it so the pair adds no net water.
     */
    const pushSource = (x: number, y: number, sigma: number, speed: number) => {
      const strength = (1.2 * speed) / Math.max(4, sigma);
      push(1, x, y, sigma, 0, strength, 0, 0, 0);
      push(1, x, y, sigma * 2, 0, -strength / 4, 0, 0, 0);
    };

    const tmp: Rgb = [0, 0, 0];
    const addRipple = (x: number, y: number, strength: number, now: number) => {
      let slot = 0;
      for (let i = 1; i < RIPPLES; i += 1) {
        if ((rippleStart[i] ?? 0) < (rippleStart[slot] ?? 0)) slot = i;
      }
      rippleStart[slot] = now;
      rippleStrength[slot] = strength;
      rippleAt[slot * 2] = x;
      rippleAt[slot * 2 + 1] = y;
    };

    const schedule = (
      at: number,
      x: number,
      y: number,
      size: number,
      toneIndex: number,
      kind: 0 | 1,
    ) => {
      const slot = pending.find((e) => !e.live);
      if (!slot) return;
      slot.live = true;
      slot.at = at;
      slot.x = x;
      slot.y = y;
      slot.size = size;
      slot.tone = toneIndex;
      slot.kind = kind;
    };

    /**
     * The signature beat: a radial shove from the drop, a dense bloom, a
     * crown of ink on the ring, a surface ripple, and the satellites landing
     * on a cascade — all inside 600 ms.
     */
    const dropSplash = (
      x: number,
      y: number,
      source: InkSplashSource | "opening",
      scale: number,
      satellites: number,
      now: number,
    ) => {
      const p = params.current;
      const s = Math.max(8, p.splashSize) * scale;
      const thick = clamp(p.viscosity, 0, 1);
      const shove =
        (380 + 900 * clamp(p.force, 0, 1)) * (1 - 0.45 * thick) * scale;
      nextTone();
      const c = colourAt(tone, tmp);
      pushSource(x, y, s * 0.5, shove);
      push(2, x, y, s * 0.6, 0, c[0], c[1], c[2], 1.25);
      push(2, x, y, s * 0.14, s * 0.72, c[0], c[1], c[2], 0.32);
      addRipple(x, y, 0.95 * Math.min(1, scale + 0.15), now);
      const n = clamp(Math.round(satellites), 0, 12);
      const gap = cascade(Math.max(2, n));
      splashes += 1;
      for (let k = 0; k < n; k += 1) {
        const base = splashes * 41 + k * 7;
        const a = ((k + hash(base, seed) * 0.7) / Math.max(1, n)) * Math.PI * 2;
        const d = s * (1.3 + 1.15 * hash(base + 1, seed));
        const size = s * (0.11 + 0.15 * hash(base + 2, seed));
        schedule(
          now + 0.045 + gap * k * (0.7 + 0.6 * hash(base + 3, seed)),
          clamp(x + Math.cos(a) * d, 2, w - 2),
          clamp(y + Math.sin(a) * d, 2, h - 2),
          size,
          tone + (hash(base + 4, seed) > 0.7 ? 1 : 0),
          0,
        );
      }
      markActive(now + 0.6);
      // The opening drop is the pool's entrance, not news.
      if (source !== "opening") {
        p.onSplash?.({ x: Math.round(x), y: Math.round(y), source });
      }
    };

    const fireEvents = (now: number) => {
      const p = params.current;
      const thick = clamp(p.viscosity, 0, 1);
      for (const e of pending) {
        if (!e.live || e.at > now) continue;
        e.live = false;
        const c = colourAt(e.tone, tmp);
        pushSource(
          e.x,
          e.y,
          e.size * 0.8,
          (220 + 260 * clamp(p.force, 0, 1)) * (1 - 0.4 * thick),
        );
        push(2, e.x, e.y, e.size * 0.75, 0, c[0], c[1], c[2], 0.95);
      }
    };

    const startAuto = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      duration: number,
      thenSplash: boolean,
      now: number,
    ) => {
      const dx = bx - ax;
      const dy = by - ay;
      const bend = (hash(Math.round(ax + by * 3), seed) - 0.5) * 0.7;
      auto.active = true;
      auto.t0 = now;
      auto.duration = duration;
      auto.ax = ax;
      auto.ay = ay;
      auto.bx = bx;
      auto.by = by;
      auto.cx = (ax + bx) / 2 - dy * bend;
      auto.cy = (ay + by) / 2 + dx * bend;
      auto.lx = ax;
      auto.ly = ay;
      auto.lt = now;
      auto.thenSplash = thenSplash;
      nextTone();
      markActive(now + duration);
    };

    const advanceAuto = (now: number) => {
      if (!auto.active) return;
      const t = clamp((now - auto.t0) / auto.duration, 0, 1);
      // Ease in and out: a hand that sets off and arrives.
      const e = t * t * (3 - 2 * t);
      const u = 1 - e;
      const x = u * u * auto.ax + 2 * u * e * auto.cx + e * e * auto.bx;
      const y = u * u * auto.ay + 2 * u * e * auto.cy + e * e * auto.by;
      const dt = Math.max(1 / 240, now - auto.lt);
      stroke(auto.lx, auto.ly, x, y, (x - auto.lx) / dt, (y - auto.ly) / dt);
      auto.lx = x;
      auto.ly = y;
      auto.lt = now;
      if (t >= 1) {
        auto.active = false;
        if (auto.thenSplash) dropSplash(x, y, "opening", 0.8, 5, now);
      }
    };

    const allocate = () => {
      const p = params.current;
      const long = Math.max(w, h);
      const simLong = clamp(
        Math.min(Math.round(p.resolution), Math.round(long / 3)),
        24,
        192,
      );
      const nsw = Math.max(8, Math.round((simLong * w) / long));
      const nsh = Math.max(8, Math.round((simLong * h) / long));
      const dyeLong = clamp(
        Math.round(long * 0.75 * clamp(p.dpr, 0.5, 2)),
        96,
        512,
      );
      const ndw = Math.max(8, Math.round((dyeLong * w) / long));
      const ndh = Math.max(8, Math.round((dyeLong * h) / long));
      const copy = (from: Framebuffer, to: Framebuffer) => {
        to.bind();
        scaleP.use();
        scaleP.texture("u_source", from.texture, 0);
        f2(scaleP, "u_texel", 1 / to.width, 1 / to.height);
        f1(scaleP, "u_scale", 1);
        tri.draw();
      };
      if (nsw !== sw || nsh !== sh) {
        const next = createPingPong(gl, nsw, nsh, true);
        if (next.precision !== "half") {
          next.dispose();
          return false;
        }
        // A resize keeps the water moving: the old field is resampled in.
        if (vel) {
          copy(vel.read, next.read);
          vel.dispose();
        }
        vel = next;
        pressure?.dispose();
        pressure = createPingPong(gl, nsw, nsh, true);
        divergence?.dispose();
        divergence = createFramebuffer(gl, nsw, nsh, true);
        curlFb?.dispose();
        curlFb = createFramebuffer(gl, nsw, nsh, true);
        sw = nsw;
        sh = nsh;
      }
      if (ndw !== dw || ndh !== dh) {
        const next = createPingPong(gl, ndw, ndh, true);
        if (dye) {
          copy(dye.read, next.read);
          dye.dispose();
        }
        dye = next;
        dw = ndw;
        dh = ndh;
      }
      cell = w / sw;
      return true;
    };

    const applySplats = () => {
      if (queued === 0 || !vel || !dye) return;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.enable(gl.SCISSOR_TEST);
      splatP.use();
      f2(splatP, "u_texel", 0, 0);
      f2(splatP, "u_res", w, h);
      for (let i = 0; i < queued; i += 1) {
        const o = i * FIELDS;
        const kind = queue[o] ?? 0;
        const x = queue[o + 1] ?? 0;
        const y = h - (queue[o + 2] ?? 0);
        const rad = queue[o + 3] ?? 1;
        const ring = queue[o + 4] ?? 0;
        const v0 = queue[o + 5] ?? 0;
        const v1 = queue[o + 6] ?? 0;
        const v2 = queue[o + 7] ?? 0;
        const amount = queue[o + 8] ?? 0;
        const target = kind === 2 ? dye.read : vel.read;
        target.bind();
        f2(splatP, "u_point", x, y);
        f1(splatP, "u_radius", rad);
        f1(splatP, "u_ring", ring);
        if (kind === 0) {
          // Screen y runs down; the field's y runs up.
          f3(splatP, "u_value", v0, -v1, 0);
          f1(splatP, "u_amount", 0);
        } else if (kind === 1) {
          f3(splatP, "u_value", 0, 0, v0);
          f1(splatP, "u_amount", 0);
        } else {
          f3(splatP, "u_value", v0 * amount, v1 * amount, v2 * amount);
          f1(splatP, "u_amount", amount);
        }
        const reach = ring + rad * 3;
        const sx = target.width / w;
        const sy = target.height / h;
        const x0 = Math.max(0, Math.floor((x - reach) * sx));
        const y0 = Math.max(0, Math.floor((y - reach) * sy));
        const x1 = Math.min(target.width, Math.ceil((x + reach) * sx));
        const y1 = Math.min(target.height, Math.ceil((y + reach) * sy));
        if (x1 <= x0 || y1 <= y0) continue;
        gl.scissor(x0, y0, x1 - x0, y1 - y0);
        tri.draw();
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      queued = 0;
    };

    const step = (dt: number, now: number) => {
      if (!vel || !dye || !pressure || !divergence || !curlFb) return;
      const p = params.current;
      const thick = clamp(p.viscosity, 0, 1);
      fireEvents(now);
      advanceAuto(now);
      applySplats();
      const tx = 1 / sw;
      const ty = 1 / sh;

      curlFb.bind();
      curlP.use();
      f2(curlP, "u_texel", tx, ty);
      f1(curlP, "u_cell", cell);
      curlP.texture("u_velocity", vel.read.texture, 0);
      tri.draw();

      vel.write.bind();
      vortP.use();
      f2(vortP, "u_texel", tx, ty);
      f1(
        vortP,
        "u_strength",
        clamp(p.curl, 0, 1) * 9 * (1 - 0.75 * thick) * cell,
      );
      f1(vortP, "u_dt", dt);
      vortP.texture("u_velocity", vel.read.texture, 0);
      vortP.texture("u_curl", curlFb.texture, 1);
      tri.draw();
      vel.swap();

      divergence.bind();
      divP.use();
      f2(divP, "u_texel", tx, ty);
      f1(divP, "u_cell", cell);
      divP.texture("u_velocity", vel.read.texture, 0);
      tri.draw();

      // Warm start: last frame's pressure, relaxed, is most of this one's.
      pressure.write.bind();
      scaleP.use();
      f2(scaleP, "u_texel", tx, ty);
      f1(scaleP, "u_scale", 0.8);
      scaleP.texture("u_source", pressure.read.texture, 0);
      tri.draw();
      pressure.swap();

      presP.use();
      f2(presP, "u_texel", tx, ty);
      f1(presP, "u_cell", cell);
      for (let i = 0; i < 18; i += 1) {
        pressure.write.bind();
        presP.texture("u_pressure", pressure.read.texture, 0);
        presP.texture("u_divergence", divergence.texture, 1);
        tri.draw();
        pressure.swap();
      }

      vel.write.bind();
      gradP.use();
      f2(gradP, "u_texel", tx, ty);
      f1(gradP, "u_cell", cell);
      gradP.texture("u_pressure", pressure.read.texture, 0);
      gradP.texture("u_velocity", vel.read.texture, 1);
      tri.draw();
      vel.swap();

      vel.write.bind();
      advectP.use();
      f2(advectP, "u_texel", tx, ty);
      f2(advectP, "u_px2uv", 1 / w, 1 / h);
      f2(advectP, "u_srcTexel", tx, ty);
      f1(advectP, "u_dt", dt);
      f1(advectP, "u_keep", Math.exp(-dt * damping()));
      // A drop's source is spent in about a tenth of a second.
      f1(advectP, "u_zKeep", Math.exp(-dt / 0.09));
      // Thick water also smooths its own flow: a viscous blend per step.
      f1(advectP, "u_diffuse", clamp(thick * 0.5 * dt * 60 * 0.25, 0, 0.5));
      advectP.texture("u_velocity", vel.read.texture, 0);
      advectP.texture("u_source", vel.read.texture, 1);
      tri.draw();
      vel.swap();

      dye.write.bind();
      f2(advectP, "u_texel", 1 / dw, 1 / dh);
      f2(advectP, "u_srcTexel", 1 / dw, 1 / dh);
      f1(advectP, "u_keep", Math.exp((-dt * 3) / p.fadeSeconds));
      f1(advectP, "u_zKeep", 1);
      f1(advectP, "u_diffuse", clamp(dt * 1.2, 0, 0.2));
      advectP.texture("u_velocity", vel.read.texture, 0);
      advectP.texture("u_source", dye.read.texture, 1);
      tri.draw();
      dye.swap();
    };

    const display = (now: number) => {
      if (!dye || lost || gl.isContextLost()) return;
      const p = params.current;
      resizeGL(gl, canvas, { dprCap: clamp(p.dpr, 0.5, 2) });
      bindScreen(gl);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (let i = 0; i < RIPPLES; i += 1) {
        const age = now - (rippleStart[i] ?? -10);
        const life = age >= 0 && age < RIPPLE_LIFE ? 1 - age / RIPPLE_LIFE : 0;
        rippleData[i * 4] = rippleAt[i * 2] ?? 0;
        rippleData[i * 4 + 1] = rippleAt[i * 2 + 1] ?? 0;
        rippleData[i * 4 + 2] = Math.max(0, age);
        rippleData[i * 4 + 3] = (rippleStrength[i] ?? 0) * life * life;
      }
      showP.use();
      f2(showP, "u_texel", 0, 0);
      f2(showP, "u_res", w, h);
      f2(showP, "u_dyeTexel", 1 / dw, 1 / dh);
      f2(showP, "u_dyePx", w / dw, h / dh);
      f1(showP, "u_opacity", clamp(p.opacity, 0, 1));
      f1(showP, "u_dark", dark);
      f3(showP, "u_line", line[0], line[1], line[2]);
      f1(showP, "u_seed", hash(9, seed) * 100);
      const at = showP.uniforms.u_ripples;
      if (at) gl.uniform4fv(at, rippleData);
      showP.texture("u_dye", dye.read.texture, 0);
      tri.draw();
      if (!shown && opened) {
        shown = true;
        // The still hands over once the opening stroke has laid some ink —
        // never to an empty pool that has not been seen yet.
        readyTimer = window.setTimeout(() => {
          readyFrame = requestAnimationFrame(() => setReady(true));
        }, 240);
      }
    };

    const ripplesLive = (now: number) => {
      for (let i = 0; i < RIPPLES; i += 1) {
        if (now - (rippleStart[i] ?? -10) < RIPPLE_LIFE) return true;
      }
      return false;
    };
    const eventsLive = () => {
      for (const e of pending) if (e.live) return true;
      return false;
    };

    const canRun = () => {
      const p = params.current;
      if (!inView || document.hidden || p.paused || lost || w < 1) return false;
      return (
        p.ambient ||
        nowS() < activeUntil ||
        queued > 0 ||
        auto.active ||
        eventsLive()
      );
    };

    const maybeDrip = (now: number) => {
      const p = params.current;
      if (!p.ambient || now - lastVisitor < 2.5 || auto.active) return;
      if (now < nextDrip) return;
      drips += 1;
      const x = w * (0.16 + 0.68 * hash(drips * 13 + 1, seed));
      const y = h * (0.2 + 0.6 * hash(drips * 13 + 2, seed));
      dropSplash(x, y, "ambient", 0.55, 3, now);
      nextDrip = now + 3.6 + 2.4 * hash(drips * 13 + 3, seed);
    };

    const open = (now: number) => {
      if (opened || w < 1) return;
      opened = true;
      // The opening: an unseen brush lays a curling stroke and lets a drop
      // fall where it ends, so the first live frame already holds ink.
      startAuto(
        w * (0.12 + 0.1 * hash(21, seed)),
        h * (0.7 + 0.12 * hash(22, seed)),
        w * (0.62 + 0.14 * hash(23, seed)),
        h * (0.34 + 0.14 * hash(24, seed)),
        0.62,
        true,
        now,
      );
      nextDrip = now + 4.2;
    };

    const tick = (t: number) => {
      raf = 0;
      const now = t / 1000;
      const dt = clamp(now - last, 0, 1 / 20);
      last = now;
      carry += dt;
      const lively =
        now - lastVisitor < 2 ||
        auto.active ||
        eventsLive() ||
        ripplesLive(now) ||
        queued > 0;
      // Once only the drip is moving the water, every other frame will do.
      if (lively || carry >= 1 / 30) {
        step(Math.min(carry, 1 / 30), now);
        display(now);
        carry = 0;
      }
      maybeDrip(now);
      if (canRun()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf || !canRun()) {
        if (!raf && w > 0) display(nowS());
        return;
      }
      last = nowS();
      carry = 0;
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const resize = () => {
      const nw = root.clientWidth;
      const nh = root.clientHeight;
      if (nw < 1 || nh < 1) return;
      w = nw;
      h = nh;
      if (!allocate()) {
        lost = true;
        halt();
        return;
      }
      if (inView) open(nowS());
      display(nowS());
      wake();
    };

    const local = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    const onMove = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive || event.pointerType === "touch" || w < 1) return;
      const pt = local(event.clientX, event.clientY);
      const now = nowS();
      if (brush.has && now - brush.t < 0.12) {
        const dt = Math.max(1 / 240, now - brush.t);
        brush.vx = brush.vx * 0.35 + ((pt.x - brush.x) / dt) * 0.65;
        brush.vy = brush.vy * 0.35 + ((pt.y - brush.y) / dt) * 0.65;
        stroke(brush.x, brush.y, pt.x, pt.y, brush.vx, brush.vy);
      } else {
        // A new stroke: the brush dips into the next pigment.
        nextTone();
        brush.vx = 0;
        brush.vy = 0;
      }
      brush.x = pt.x;
      brush.y = pt.y;
      brush.t = now;
      brush.has = true;
      lastVisitor = now;
      markActive(now);
      wake();
    };
    const onLeave = () => {
      brush.has = false;
    };

    const onClick = (event: MouseEvent) => {
      const p = params.current;
      if (!p.splash || w < 1) return;
      const now = nowS();
      if (event.detail === 0) {
        // Enter or Space on a control: a click with no pointer behind it.
        const el = event.target;
        if (!(el instanceof HTMLElement) || el === root) return;
        const r = el.getBoundingClientRect();
        const pt = local(r.left + r.width / 2, r.top + r.height / 2);
        dropSplash(pt.x, pt.y, "keyboard", 1, p.droplets, now);
      } else {
        if (!p.interactive) return;
        const pt = local(event.clientX, event.clientY);
        dropSplash(pt.x, pt.y, "pointer", 1, p.droplets, now);
      }
      lastVisitor = now;
      wake();
    };

    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!params.current.followFocus || !el.matches(":focus-visible")) return;
      if (w < 1) return;
      const r = el.getBoundingClientRect();
      const to = local(r.left + r.width / 2, r.top + r.height / 2);
      const from = focusPoint ?? { x: w * 0.06, y: to.y + h * 0.18 };
      const now = nowS();
      startAuto(from.x, from.y, to.x, to.y, 0.36, false, now);
      focusPoint = to;
      lastVisitor = now;
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      focusPoint = null;
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(resize);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) {
        open(nowS());
        wake();
      } else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const detach = onContextLoss(canvas, () => {
      lost = true;
      halt();
      // The still comes back and stays: it is the designed fallback.
      setReady(false);
      setFailed(true);
    });

    recolour();
    resize();
    api.current = {
      recolour: () => {
        recolour();
        if (!raf && w > 0) display(nowS());
      },
      resize: () => {
        if (w < 1) return;
        if (!allocate()) {
          lost = true;
          halt();
          return;
        }
        wake();
      },
      wake: () => {
        if (!params.current.interactive) brush.has = false;
        markActive(nowS());
        wake();
      },
    };

    return () => {
      halt();
      lost = true;
      cancelAnimationFrame(readyFrame);
      window.clearTimeout(readyTimer);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detach();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      vel?.dispose();
      dye?.dispose();
      pressure?.dispose();
      divergence?.dispose();
      curlFb?.dispose();
      tri.dispose();
      for (const p of programs) p?.dispose();
      api.current = null;
      setReady(false);
    };
  }, [failed, motionSafe, seed]);

  // Reduced motion: no water to stir, but a click or Enter/Space still
  // answers with a blot that crossfades in where it landed and fades away.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || motionSafe) return;
    const onClick = (event: MouseEvent) => {
      const p = params.current;
      if (!p.splash) return;
      const box = root.getBoundingClientRect();
      let x = event.clientX - box.left;
      let y = event.clientY - box.top;
      if (event.detail === 0) {
        const el = event.target;
        if (!(el instanceof HTMLElement) || el === root) return;
        const r = el.getBoundingClientRect();
        x = r.left + r.width / 2 - box.left;
        y = r.top + r.height / 2 - box.top;
      } else if (!p.interactive) return;
      blotCount.current += 1;
      const id = blotCount.current;
      const color = p.palette[id % Math.max(1, p.palette.length)] ?? "";
      setBlots((list) => [
        ...list.slice(-4),
        {
          id,
          x: Math.round(x),
          y: Math.round(y),
          size: Math.round(Math.max(8, p.splashSize) * 2.6),
          color,
        },
      ]);
      p.onSplash?.({
        x: Math.round(x),
        y: Math.round(y),
        source: event.detail === 0 ? "keyboard" : "pointer",
      });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [motionSafe]);

  React.useEffect(() => {
    api.current?.recolour();
  }, [paletteKey]);

  React.useEffect(() => {
    api.current?.resize();
  }, [resolution, dpr]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    viscosity,
    fadeSeconds,
    curl,
    radius,
    force,
    opacity,
    ambient,
    interactive,
    followFocus,
    paused,
  ]);

  const blotLife = Math.max(fadeSeconds, 1);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate touch-manipulation overflow-clip",
        className,
      )}
    >
      {/* The server and the first paint get the still swirl, which the live
          pool replaces once its opening stroke has laid ink; without WebGL2
          or under reduced motion it stays. */}
      <div
        aria-hidden
        data-still={ready ? undefined : ""}
        className={cn(
          "pointer-events-none absolute inset-0 z-0 transition-opacity",
          ready && "opacity-0",
        )}
        style={{
          transitionDuration: `${Math.round(durations.slow * 1000)}ms`,
        }}
      >
        <InkStill palette={palette} seed={seed} id={`ink-${uid}`} />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 size-full",
          (failed || !motionSafe) && "hidden",
        )}
      />
      {blots.length > 0 ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          {blots.map((blot) => (
            <motion.span
              key={blot.id}
              className="absolute rounded-full"
              style={{
                left: blot.x - blot.size / 2,
                top: blot.y - blot.size / 2,
                width: blot.size,
                height: blot.size,
                background: `radial-gradient(closest-side, ${blot.color}, transparent)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.75, 0.75, 0] }}
              transition={{
                duration: blotLife,
                times: [0, r3(durations.base / blotLife), 0.45, 1],
                ease: "linear",
              }}
              onAnimationComplete={() =>
                setBlots((list) => list.filter((b) => b.id !== blot.id))
              }
            />
          ))}
        </div>
      ) : null}
      <div className="relative z-10 size-full">{children}</div>
      {/* Colours are resolved on this probe, inside the component, so a
          themed wrapper's tokens are the ones read. */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.recolour()}
        className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
      />
    </div>
  );
}
