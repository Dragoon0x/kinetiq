"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type MercuryGateKind = "field" | "shore" | "dunes" | "peaks" | "grove";

export type MercuryGateDestination = {
  /** Stable id: the value. */
  id: string;
  /** The place's name, shown and spoken. */
  title: string;
  /** A short line under the title. */
  caption?: string;
  /** Which built-in painting to draw when there is no `scene`. @default "field" */
  kind?: MercuryGateKind;
  /** The colour the built-in painting is made from, any CSS colour. */
  tone?: string;
  /** Your own scene, filling the card (an image, a gradient, a component). */
  scene?: React.ReactNode;
};

export const defaultMercuryGateDestinations: MercuryGateDestination[] = [
  {
    id: "field",
    title: "The field",
    caption: "Where every trip starts",
    kind: "field",
  },
  {
    id: "coldbrook-shore",
    title: "Coldbrook Shore",
    caption: "Low tide at first light",
    kind: "shore",
  },
  {
    id: "fernworks-glasshouse",
    title: "Fernworks Glasshouse",
    caption: "Palms under a glass roof",
    kind: "grove",
  },
  {
    id: "gaugeworks-ridge",
    title: "Gaugeworks Ridge",
    caption: "Three ridges at dusk",
    kind: "peaks",
  },
];

export type MercuryGateProps = {
  /** The places the gate connects. @default four invented places */
  destinations?: MercuryGateDestination[];
  /** Where you are: a destination id (controlled). */
  value?: string;
  /** Where you start when uncontrolled. @default the first destination */
  defaultValue?: string;
  /** Fires when a dive arrives, with the new place's id. */
  onValueChange?: (id: string) => void;
  /** Where the gate leads: a destination id (controlled). */
  target?: string;
  /** Where the gate first leads when uncontrolled. @default the next destination */
  defaultTarget?: string;
  /** Fires from the key or mark that pointed the gate somewhere else, and on arrival as it turns to lead back. */
  onTargetChange?: (id: string) => void;
  /** Fires as a dive begins, with where from and where to. */
  onDive?: (from: string, to: string) => void;
  /** How high the hover ripples run and how wide the mercury parts, 0 to 1. @default 0.55 */
  ripple?: number;
  /** How strongly the ring glows, 0 to 1. @default 0.5 */
  glow?: number;
  /** How many motes the gate draws in, and how fast, 0 to 1. @default 0.5 */
  pull?: number;
  /** The ring's diameter as a share of the box's short side, 0.4 to 1. @default 0.8 */
  ringSize?: number;
  /** The ring's metal, any CSS colour. @default a cool silver from the accent token */
  metalColor?: string;
  /** The ring's glow and the motes, any CSS colour. @default "var(--accent-bright)" */
  glowColor?: string;
  /** Show where you are and where the gate leads, as text over the scene. @default true */
  showLabels?: boolean;
  /** A whoosh as you dive, and a softer one as the ring re-forms. @default false */
  sound?: boolean;
  /** Hold the mercury and the motes still. @default false */
  paused?: boolean;
  /** Seeds the motes and the built-in paintings' stars and ridges. @default 1 */
  seed?: number;
  /** Cap on the canvases' device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The gate's accessible name, before "to" and the place. @default "Go through" */
  label?: string;
  /** No diving and no changing where it leads. @default false */
  disabled?: boolean;
  /** Sizes the gate; it fills its parent by default. */
  className?: string;
};

const TAU = Math.PI * 2;
const RIPPLES = 6;
const DIVE = 0.64;
const ANTICIPATE = 0.08;
const IDLE_FRAME = 33;
const MAX_MOTES = 90;
const MAX_STREAKS = 48;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec2 u_c;
uniform float u_R;
uniform float u_tube;
uniform float u_time;
uniform vec4 u_ripples[${RIPPLES}];
uniform float u_amp;
uniform vec3 u_clear;
uniform float u_mercury;
uniform float u_glow;
uniform float u_ringAlpha;
uniform vec3 u_metal;
uniform vec3 u_glowColor;
uniform vec3 u_envA;
uniform vec3 u_envB;
in vec2 v_uv;
out vec4 o_color;

float height(vec2 p) {
  vec2 q = p - u_c;
  vec2 n = q / u_R;
  float r = length(n);
  // A slow idle wobble — two cartesian modes, so the centre has no seam — and a gentle dome.
  float rim = 1.0 - r * r;
  float h = 0.006 * sin(r * 7.0 - u_time * 1.1 + 0.8 * sin(n.x * 2.3 + u_time * 0.3)) * rim;
  h += 0.012 * sin(n.x * 3.1 + u_time * 0.7) * sin(n.y * 2.6 - u_time * 0.5 + 0.6) * rim;
  h += 0.07 * rim;
  for (int i = 0; i < ${RIPPLES}; i += 1) {
    vec4 rp = u_ripples[i];
    if (rp.w <= 0.0) continue;
    float d = length(p - rp.xy) / u_R;
    float front = rp.z * 0.95;
    float env = exp(-pow((d - front) * 3.5, 2.0)) * exp(-rp.z * 1.4);
    h += rp.w * u_amp * 0.045 * sin((d - front) * 22.0) * env;
  }
  return h;
}

vec3 env(vec3 r) {
  // A horizon: bright sky over dark ground, the crisp line mercury is known by.
  float t = -r.y - r.x * 0.18 + 0.14;
  vec3 col = mix(u_envA, u_envB, smoothstep(-0.04, 0.2, t));
  col = mix(col, u_envB * 0.55 + u_envA * 0.45, smoothstep(0.35, 0.75, r.y) * 0.5);
  col *= 0.82 + 0.18 * smoothstep(-0.6, 0.6, t);
  // A softbox high on the left, a thin strip light on the right.
  col += vec3(1.0) * pow(max(0.0, dot(r, normalize(vec3(-0.45, -0.7, 0.55)))), 36.0) * 1.1;
  col += vec3(0.9) * pow(max(0.0, dot(r, normalize(vec3(0.8, 0.1, 0.6)))), 90.0) * 0.6;
  return col;
}

void main() {
  vec2 p = v_uv * u_res;
  vec2 q = p - u_c;
  float rp = length(q);
  vec4 outC = vec4(0.0);

  // The membrane.
  if (rp < u_R + 1.0) {
    float e = 1.0;
    float hx = (height(p + vec2(e, 0.0)) - height(p - vec2(e, 0.0))) / (2.0 * e) * u_R;
    float hy = (height(p + vec2(0.0, e)) - height(p - vec2(0.0, e))) / (2.0 * e) * u_R;
    vec3 n = normalize(vec3(-hx, -hy, 1.0));
    vec3 rv = reflect(vec3(0.0, 0.0, -1.0), n);
    vec3 col = env(rv) * u_metal;
    float fres = pow(1.0 - n.z, 2.0);
    col = mix(col, u_envB, fres * 0.5);
    // The clearing: mercury parts to a thin film, with a beaded meniscus.
    float dc = length(p - u_clear.xy);
    float ang = atan(p.y - u_clear.y, p.x - u_clear.x);
    float wob = (0.05 * sin(ang * 5.0 + u_time * 2.1) + 0.03 * sin(ang * 9.0 - u_time * 1.3)) * u_clear.z;
    float m = smoothstep(u_clear.z - 5.0, u_clear.z + 5.0, dc + wob);
    m = mix(1.0, m, smoothstep(0.0, 6.0, u_clear.z));
    float rim = exp(-pow((dc + wob - u_clear.z) / 2.4, 2.0)) * step(1.0, u_clear.z);
    float spec = pow(max(0.0, dot(rv, normalize(vec3(-0.45, -0.7, 0.55)))), 22.0);
    float alpha = mix(0.08 + spec * 0.35, 1.0, m) * u_mercury;
    col = mix(vec3(1.0), col, m);
    col += vec3(1.0) * rim * 0.75 * u_mercury;
    alpha = max(alpha, rim * 0.8 * u_mercury);
    float edge = 1.0 - smoothstep(u_R - 1.0, u_R + 1.0, rp);
    alpha *= edge;
    outC = vec4(col * alpha, alpha);
  }

  // The ring: a polished tube with a glow.
  float rc = u_R + u_tube * 0.55;
  float s = (rp - rc) / u_tube;
  float glowAmt = 0.0;
  if (abs(s) < 1.0) {
    vec2 dir = q / max(rp, 1e-3);
    vec3 n = normalize(vec3(dir * s, sqrt(max(0.0, 1.0 - s * s))));
    vec3 rv = reflect(vec3(0.0, 0.0, -1.0), n);
    vec3 col = env(rv) * u_metal * 1.05;
    col += u_glowColor * u_glow * 0.35 * smoothstep(-0.2, -1.0, s);
    float a = (1.0 - smoothstep(0.85, 1.0, abs(s))) * u_ringAlpha;
    outC = vec4(col * a, a) + outC * (1.0 - a);
  }
  float out_ = max(0.0, rp - (rc + u_tube));
  float in_ = max(0.0, (rc - u_tube) - rp);
  glowAmt = exp(-out_ / (u_R * 0.22)) * step(rc, rp) + exp(-in_ / (u_R * 0.06)) * 0.5 * step(rp, rc);
  float pulse = 0.88 + 0.12 * sin(u_time * 1.3);
  float g = glowAmt * u_glow * pulse * 0.55 * u_ringAlpha;
  outC.rgb += u_glowColor * g;
  outC.a = max(outC.a, 0.0) + g * 0.35 * (1.0 - outC.a);
  o_color = clamp(outC, 0.0, 1.0);
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const textHash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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

const TONE: Record<MercuryGateKind, string> = {
  field: "var(--accent)",
  shore: "var(--accent-bright)",
  dunes: "var(--warn)",
  peaks: "var(--accent)",
  grove: "var(--success)",
};

const toneOf = (d: MercuryGateDestination | undefined) =>
  d?.tone ?? TONE[d?.kind ?? "field"];

/* ------------------------------ the paintings ----------------------------- */

/** A built-in place, painted in SVG from one tone; fixed art, the same in both themes. */
function Painting({
  dest,
  seed,
}: {
  dest: MercuryGateDestination;
  seed: number;
}) {
  const uid = React.useId();
  const t = toneOf(dest);
  const kind = dest.kind ?? "field";
  const h = textHash(dest.id) ^ Math.round(seed);
  const sky = `${uid}-sky`;
  const low = `${uid}-low`;
  const sun = `${uid}-sun`;
  const stars = Array.from(
    { length: kind === "field" ? 46 : kind === "peaks" ? 18 : 0 },
    (_, i) => ({
      x: r1(hash(h, i, 1) * 400),
      y: r1(hash(h, i, 2) * (kind === "field" ? 136 : 80)),
      r: r2(0.35 + hash(h, i, 3) * 0.75),
      o: r2(0.25 + hash(h, i, 4) * 0.65),
    }),
  );
  const ridge = (base: number, amp: number, k: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 16; i += 1) {
      const x = (i / 16) * 420 - 10;
      const y =
        base - amp * (0.4 + hash(h, i, k) * 0.6) * (i % 2 === 0 ? 1 : 0.45);
      pts.push(`${r1(x)} ${r1(y)}`);
    }
    return `M -10 210 L ${pts.join(" L ")} L 410 210 Z`;
  };
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id={sky} x1="0" x2="0" y1="0" y2="1">
          {kind === "field" ? (
            <>
              <stop offset="0" stopColor={`oklch(from ${t} 0.15 0.04 h)`} />
              <stop
                offset="0.75"
                stopColor={`oklch(from ${t} 0.3 0.08 calc(h + 24))`}
              />
            </>
          ) : kind === "shore" ? (
            <>
              <stop offset="0" stopColor={`oklch(from ${t} 0.38 0.08 h)`} />
              <stop
                offset="0.45"
                stopColor={`oklch(from var(--danger) 0.66 0.08 calc(h + 10))`}
              />
              <stop
                offset="0.66"
                stopColor={`oklch(from var(--warn) 0.86 0.08 h)`}
              />
            </>
          ) : kind === "dunes" ? (
            <>
              <stop
                offset="0"
                stopColor={`oklch(from ${t} 0.42 0.08 calc(h - 50))`}
              />
              <stop offset="0.6" stopColor={`oklch(from ${t} 0.8 0.1 h)`} />
            </>
          ) : kind === "peaks" ? (
            <>
              <stop
                offset="0"
                stopColor={`oklch(from ${t} 0.24 0.06 calc(h + 20))`}
              />
              <stop
                offset="0.7"
                stopColor={`oklch(from var(--danger) 0.62 0.09 calc(h + 15))`}
              />
            </>
          ) : (
            <>
              <stop offset="0" stopColor={`oklch(from ${t} 0.2 0.05 h)`} />
              <stop
                offset="0.5"
                stopColor={`oklch(from ${t} 0.62 0.07 calc(h + 20))`}
              />
              <stop offset="1" stopColor={`oklch(from ${t} 0.4 0.06 h)`} />
            </>
          )}
        </linearGradient>
        <linearGradient id={low} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={`oklch(from ${t} 0.44 0.09 h)`} />
          <stop offset="1" stopColor={`oklch(from ${t} 0.2 0.06 h)`} />
        </linearGradient>
        <radialGradient id={sun}>
          <stop offset="0" stopColor="oklch(from var(--warn) 0.95 0.08 h)" />
          <stop
            offset="0.3"
            stopColor="oklch(from var(--warn) 0.9 0.1 h)"
            stopOpacity="0.6"
          />
          <stop
            offset="1"
            stopColor="oklch(from var(--warn) 0.85 0.1 h)"
            stopOpacity="0"
          />
        </radialGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${sky})`} />
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="oklch(0.97 0.02 250)"
          opacity={s.o}
        />
      ))}
      {kind === "field" ? (
        <>
          <ellipse
            cx="200"
            cy="152"
            rx="260"
            ry="26"
            fill={`oklch(from ${t} 0.5 0.12 calc(h + 30))`}
            opacity="0.35"
          />
          <path
            d="M -10 210 L -10 150 C 80 142 150 156 230 148 C 300 141 350 152 410 146 L 410 210 Z"
            fill={`oklch(from ${t} 0.11 0.03 h)`}
          />
        </>
      ) : null}
      {kind === "shore" ? (
        <>
          <circle cx="250" cy="128" r="46" fill={`url(#${sun})`} />
          <circle
            cx="250"
            cy="130"
            r="14"
            fill="oklch(from var(--warn) 0.95 0.07 h)"
          />
          <rect y="130" width="400" height="70" fill={`url(#${low})`} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect
              key={i}
              x={r1(250 - (10 + i * 9) * (0.6 + hash(h, i, 9) * 0.6))}
              y={r1(136 + i * 9)}
              width={r1(2 * (10 + i * 9) * (0.6 + hash(h, i, 9) * 0.6))}
              height="1.4"
              rx="0.7"
              fill="oklch(from var(--warn) 0.92 0.07 h)"
              opacity={r2(0.55 - i * 0.07)}
            />
          ))}
          <path
            d="M -10 131 C 30 112 60 116 92 124 C 110 128 120 130 130 131 Z"
            fill={`oklch(from ${t} 0.26 0.05 h)`}
          />
        </>
      ) : null}
      {kind === "dunes" ? (
        <>
          <circle cx="110" cy="96" r="40" fill={`url(#${sun})`} />
          <circle
            cx="110"
            cy="98"
            r="11"
            fill="oklch(from var(--warn) 0.96 0.06 h)"
          />
          <path
            d="M -10 210 L -10 118 C 60 96 130 126 200 112 C 270 98 330 120 410 106 L 410 210 Z"
            fill={`oklch(from ${t} 0.66 0.11 calc(h - 8))`}
          />
          <path
            d="M -10 210 L -10 150 C 80 128 160 160 240 140 C 300 126 350 140 410 132 L 410 210 Z"
            fill={`oklch(from ${t} 0.5 0.11 calc(h - 18))`}
          />
          <path
            d="M -10 210 L -10 178 C 90 160 190 190 280 168 C 330 156 370 166 410 160 L 410 210 Z"
            fill={`oklch(from ${t} 0.34 0.09 calc(h - 28))`}
          />
        </>
      ) : null}
      {kind === "peaks" ? (
        <>
          <circle
            cx="318"
            cy="44"
            r="9"
            fill="oklch(0.95 0.02 250)"
            opacity="0.9"
          />
          <path
            d={ridge(122, 46, 11)}
            fill={`oklch(from ${t} 0.42 0.06 calc(h + 30))`}
          />
          <path
            d={ridge(150, 50, 12)}
            fill={`oklch(from ${t} 0.28 0.06 calc(h + 15))`}
          />
          <path d={ridge(178, 44, 13)} fill={`oklch(from ${t} 0.15 0.04 h)`} />
        </>
      ) : null}
      {kind === "grove" ? (
        <>
          <path
            d="M 40 210 L 40 70 Q 200 -30 360 70 L 360 210"
            fill="none"
            stroke="oklch(from var(--success) 0.9 0.03 h)"
            strokeOpacity="0.45"
            strokeWidth="2"
          />
          {[80, 120, 160, 200, 240, 280, 320].map((x) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1={r1(70 - 60 * Math.sin((Math.PI * (x - 40)) / 320) * 0.8)}
              y2="210"
              stroke="oklch(from var(--success) 0.9 0.03 h)"
              strokeOpacity="0.28"
              strokeWidth="1"
            />
          ))}
          {[0, 1, 2, 3, 4].map((i) => {
            const x = 60 + i * 72 + hash(h, i, 21) * 20;
            const top = 96 + hash(h, i, 22) * 30;
            const fronds = [0, 1, 2, 3, 4, 5].map((j) => {
              const a = -Math.PI * (0.12 + (j / 5) * 0.76);
              const len = 34 + hash(h, i * 7 + j, 23) * 18;
              return `M ${r1(x)} ${r1(top)} Q ${r1(x + Math.cos(a) * len * 0.6)} ${r1(top + Math.sin(a) * len * 0.9 - 8)} ${r1(x + Math.cos(a) * len)} ${r1(top + Math.sin(a) * len * 0.4 + 18)}`;
            });
            return (
              <g key={i}>
                <line
                  x1={r1(x)}
                  x2={r1(x + 4)}
                  y1={r1(top)}
                  y2="200"
                  stroke={`oklch(from ${t} 0.24 0.04 h)`}
                  strokeWidth="3"
                />
                {fronds.map((d, j) => (
                  <path
                    key={j}
                    d={d}
                    fill="none"
                    stroke={`oklch(from ${t} ${r2(0.28 + (i % 2) * 0.08)} 0.08 h)`}
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            );
          })}
          <rect
            y="0"
            width="400"
            height="26"
            fill={`oklch(from ${t} 0.16 0.04 h)`}
            opacity="0.55"
          />
          <rect
            y="186"
            width="400"
            height="14"
            fill={`oklch(from ${t} 0.16 0.04 h)`}
          />
        </>
      ) : null}
    </svg>
  );
}

function Scene({
  dest,
  seed,
}: {
  dest: MercuryGateDestination | undefined;
  seed: number;
}) {
  if (!dest) return null;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {dest.scene ?? <Painting dest={dest} seed={seed} />}
    </div>
  );
}

/* --------------------------------- engine --------------------------------- */

type Config = {
  colorKey: string;
  ripple: number;
  glow: number;
  pull: number;
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
  /** The pointer over the gate (client coordinates), or null as it leaves. */
  hover: (x: number | null, y: number | null) => void;
  focus: (on: boolean) => void;
  /** The gate now leads somewhere else: a ripple from the centre. */
  retarget: () => void;
  /** Starts the dive; `commit` is called at its peak. Returns false if already diving. */
  dive: (commit: () => void) => boolean;
  /** React has swapped the scenes: the ring may re-form. */
  swapped: () => void;
  dispose: () => void;
};

type Refs = {
  root: HTMLDivElement;
  gl: HTMLCanvasElement;
  fx: HTMLCanvasElement;
  portal: HTMLDivElement;
  flash: HTMLDivElement;
  gate: HTMLButtonElement;
  carriers: HTMLElement;
};

function createEngine(
  refs: Refs,
  visible: { current: boolean },
  onReform: () => void,
): Engine {
  const { root, portal, flash, gate, carriers } = refs;
  const ctx = refs.fx.getContext("2d");
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let clock = 0;
  let time = 0;
  const size = { w: 0, h: 0, scale: 1 };
  const ring = { x: 0, y: 0, r: 60 };
  const read = rgbReader();
  // metal, glow, envA, envB, streak
  const colours = new Float32Array(15);
  let glowRgb = "rgb(140, 160, 255)";
  let streakRgb = "rgb(255, 255, 255)";
  // Ripples: x, y, age, strength.
  const ripples = new Float32Array(RIPPLES * 4);
  let slot = 0;
  const pointer = {
    x: 0,
    y: 0,
    in: false,
    focus: false,
    lastX: 0,
    lastY: 0,
    travel: 0,
  };
  // The clearing: centre and radius, the radius on a spring.
  const clearing = { x: 0, y: 0, r: 0, v: 0, target: 0 };
  let mercury = 1;
  let mercuryTarget = 1;
  // The dive: phase, its clock, the ring's scale and its spring velocity.
  let phase: "idle" | "fade" | "dive" | "await" | "reform" = "idle";
  let phaseAt = 0;
  let ringScale = 1;
  let ringV = 0;
  let ringAlpha = 1;
  let commit: (() => void) | null = null;
  let flashLevel = 0;
  let holdClear = 0;
  // Motes and streaks in typed arrays.
  const motes = new Float32Array(MAX_MOTES * 3);
  const streaks = new Float32Array(MAX_STREAKS * 4);
  let streakCount = 0;

  const build = (): boolean => {
    const gl = createGL(refs.gl, { alpha: true, premultipliedAlpha: true });
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

  const maxReach = () =>
    Math.hypot(
      Math.max(ring.x, size.w - ring.x),
      Math.max(ring.y, size.h - ring.y),
    );

  const seedMote = (i: number, fresh: boolean) => {
    const s = Math.round(cfg?.seed ?? 1);
    const k = Math.floor(clock * 3) + i * 13;
    const reach = maxReach();
    motes[i * 3] = hash(s, k, 1) * TAU;
    motes[i * 3 + 1] = fresh
      ? lerp(ring.r * 1.15, reach, hash(s, i, 2))
      : reach * lerp(0.85, 1.1, hash(s, k, 3));
    motes[i * 3 + 2] = 0.6 + hash(s, k, 4) * 0.9;
  };

  const moteCount = () => Math.round(12 + clamp(cfg?.pull ?? 0.5, 0, 1) * 60);

  const measure = () => {
    const rr = root.getBoundingClientRect();
    const gr = gate.getBoundingClientRect();
    size.w = rr.width;
    size.h = rr.height;
    ring.x = gr.left + gr.width / 2 - rr.left;
    ring.y = gr.top + gr.height / 2 - rr.top;
    ring.r = Math.max(8, gr.width / 2);
  };

  const membraneR = () => ring.r * 0.9 * ringScale;

  const writePortal = () => {
    const covered = phase === "dive" || phase === "await" || phase === "fade";
    const r = covered || phase === "reform" ? membraneR() : ring.r * 0.9;
    portal.style.clipPath = `circle(${r1(r)}px at ${r1(ring.x)}px ${r1(ring.y)}px)`;
    flash.style.opacity = String(r3(flashLevel));
    // The stand-in mercury (no WebGL2) follows the same state through two attributes.
    const clear = phase !== "idle" || pointer.in || pointer.focus;
    if (clear !== root.hasAttribute("data-clear"))
      root.toggleAttribute("data-clear", clear);
    const diving = phase === "dive" || phase === "await" || phase === "fade";
    if (diving !== root.hasAttribute("data-diving"))
      root.toggleAttribute("data-diving", diving);
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    p.program.set({
      u_res: [size.w, size.h],
      u_amp: clamp(c.ripple, 0, 1),
      u_glow: clamp(c.glow, 0, 1),
      u_metal: [colours[0] ?? 0.8, colours[1] ?? 0.8, colours[2] ?? 0.85],
      u_glowColor: [colours[3] ?? 0.5, colours[4] ?? 0.6, colours[5] ?? 1],
      u_envA: [colours[6] ?? 0.05, colours[7] ?? 0.05, colours[8] ?? 0.1],
      u_envB: [colours[9] ?? 0.9, colours[10] ?? 0.92, colours[11] ?? 1],
    });
  };

  const drawGl = () => {
    const p = gpu;
    if (!p || p.lost || size.w < 1) return;
    const gl = p.gl;
    gl.viewport(0, 0, refs.gl.width, refs.gl.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    p.program.set({
      u_c: [ring.x, ring.y],
      u_R: membraneR(),
      u_tube: Math.max(2, ring.r * 0.1 * ringScale),
      u_time: r3(time),
      u_ripples: ripples,
      u_clear: [clearing.x, clearing.y, Math.max(0, clearing.r)],
      u_mercury: clamp(mercury, 0, 1),
      u_ringAlpha: clamp(ringAlpha, 0, 1),
    });
    // Only the ring and its halo need pixels, unless the ring is flying past.
    const pad = ring.r * ringScale * 1.7;
    const s = size.scale;
    const x0 = Math.max(0, Math.floor((ring.x - pad) * s));
    const y0 = Math.max(0, Math.floor((size.h - ring.y - pad) * s));
    const x1 = Math.min(refs.gl.width, Math.ceil((ring.x + pad) * s));
    const y1 = Math.min(refs.gl.height, Math.ceil((size.h - ring.y + pad) * s));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    p.tri.draw();
    gl.disable(gl.SCISSOR_TEST);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const drawFx = () => {
    const c = cfg;
    if (!ctx || !c) return;
    ctx.setTransform(size.scale, 0, 0, size.scale, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const n = Math.min(MAX_MOTES, moteCount());
    const reach = maxReach();
    ctx.strokeStyle = glowRgb;
    ctx.fillStyle = glowRgb;
    ctx.lineCap = "round";
    for (let i = 0; i < n; i += 1) {
      const a = motes[i * 3] ?? 0;
      const d = motes[i * 3 + 1] ?? reach;
      const x = ring.x + Math.cos(a) * d;
      const y = ring.y + Math.sin(a) * d;
      // A short tail, longer as the mote speeds up near the ring.
      const near = ring.r / Math.max(ring.r, d);
      const pa = a - 0.04 * near * near;
      const pd = d + 3 + 9 * near * near;
      const fadeIn = clamp((reach - d) / (reach * 0.25), 0, 1);
      const fadeOut = clamp((d - ring.r * 0.95) / (ring.r * 0.5), 0, 1);
      const alpha = fadeIn * fadeOut * 0.5 * ringAlpha;
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = motes[i * 3 + 2] ?? 1;
      ctx.beginPath();
      ctx.moveTo(ring.x + Math.cos(pa) * pd, ring.y + Math.sin(pa) * pd);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (streakCount > 0) {
      ctx.strokeStyle = streakRgb;
      for (let i = 0; i < streakCount; i += 1) {
        const a = streaks[i * 4] ?? 0;
        const d = streaks[i * 4 + 1] ?? 0;
        const len = streaks[i * 4 + 2] ?? 0;
        const life = streaks[i * 4 + 3] ?? 0;
        if (life <= 0) continue;
        ctx.globalAlpha = clamp(life, 0, 1) * 0.8;
        ctx.lineWidth = 1 + life;
        ctx.beginPath();
        ctx.moveTo(ring.x + Math.cos(a) * d, ring.y + Math.sin(a) * d);
        ctx.lineTo(
          ring.x + Math.cos(a) * (d + len),
          ring.y + Math.sin(a) * (d + len),
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  const draw = () => {
    writePortal();
    drawGl();
    drawFx();
  };

  const busy = () =>
    phase !== "idle" ||
    pointer.in ||
    pointer.focus ||
    Math.abs(clearing.r - clearing.target) > 0.3 ||
    Math.abs(clearing.v) > 0.3 ||
    Math.abs(mercury - mercuryTarget) > 0.002 ||
    flashLevel > 0.002;

  const ambient = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused);
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    if (ambient()) time += dt;
    // Ripples age; a dead one frees its slot.
    for (let i = 0; i < RIPPLES; i += 1) {
      if ((ripples[i * 4 + 3] ?? 0) <= 0) continue;
      ripples[i * 4 + 2] = (ripples[i * 4 + 2] ?? 0) + dt;
      if ((ripples[i * 4 + 2] ?? 0) > 2.2) ripples[i * 4 + 3] = 0;
    }
    // The clearing's radius rides the glide spring; it closes on drift.
    const sp = clearing.target > clearing.r ? springs.glide : springs.drift;
    if (c.motionSafe) {
      const kk = sp.stiffness / sp.mass;
      const cc = sp.damping / sp.mass;
      const sub = Math.ceil(dt / (1 / 240));
      for (let k = 0; k < sub; k += 1) {
        const h = dt / sub;
        clearing.v +=
          (-kk * (clearing.r - clearing.target) - cc * clearing.v) * h;
        clearing.r += clearing.v * h;
      }
      // The clearing's centre drifts from the pointer to the middle as it opens.
      const open = clamp(clearing.r / Math.max(1, ring.r * 0.9), 0, 1);
      const tx = pointer.in ? lerp(pointer.x, ring.x, open * 0.85) : ring.x;
      const ty = pointer.in ? lerp(pointer.y, ring.y, open * 0.85) : ring.y;
      clearing.x += (tx - clearing.x) * Math.min(1, dt * 6);
      clearing.y += (ty - clearing.y) * Math.min(1, dt * 6);
    } else {
      clearing.r = clearing.target;
      clearing.v = 0;
      clearing.x = ring.x;
      clearing.y = ring.y;
    }
    // Reduced motion and the arrival fade the mercury on a tween.
    const rate = dt / durations.slow;
    mercury += clamp(mercuryTarget - mercury, -rate, rate);
    // Motes spiral in, faster as they near the ring.
    if (ambient() && phase !== "dive") {
      const n = Math.min(MAX_MOTES, moteCount());
      const speed = lerp(18, 70, clamp(c.pull, 0, 1));
      for (let i = 0; i < n; i += 1) {
        const d = motes[i * 3 + 1] ?? 0;
        const near = ring.r / Math.max(ring.r, d);
        motes[i * 3 + 1] = d - speed * (0.5 + 1.4 * near * near) * dt * 1.6;
        motes[i * 3] = (motes[i * 3] ?? 0) + dt * 0.5 * near * near;
        if ((motes[i * 3 + 1] ?? 0) < ring.r * 0.92) seedMote(i, false);
      }
    }
    // Streaks fly outward and fade.
    for (let i = 0; i < streakCount; i += 1) {
      const life = streaks[i * 4 + 3] ?? 0;
      if (life <= 0) continue;
      const d = streaks[i * 4 + 1] ?? 0;
      const v = 380 + d * 2.6;
      streaks[i * 4 + 1] = d + v * dt;
      streaks[i * 4 + 2] = Math.min(
        140,
        (streaks[i * 4 + 2] ?? 0) + v * dt * 0.6,
      );
      streaks[i * 4 + 3] = life - dt * 1.9;
    }
    // The dive and the re-forming.
    const t = clock - phaseAt;
    if (phase === "dive") {
      const reach = maxReach();
      const top = (reach / Math.max(1, ring.r * 0.9)) * 1.12;
      if (t < ANTICIPATE) {
        // A breath in before the rush.
        ringScale = 1 - 0.04 * Math.sin((t / ANTICIPATE) * Math.PI * 0.5);
      } else {
        const u = clamp((t - ANTICIPATE) / (DIVE - ANTICIPATE), 0, 1);
        ringScale = 0.96 + (top - 0.96) * u * u * u;
      }
      mercury = Math.max(0, 1 - t / 0.14);
      ringAlpha = 1 - clamp((t - 0.3) / 0.3, 0, 1);
      // Streaks pour out through the middle of the dive.
      const want = Math.floor(clamp((t - 0.08) / 0.48, 0, 1) * MAX_STREAKS);
      while (streakCount < want) {
        const i = streakCount;
        const s = Math.round(c.seed) + 7;
        streaks[i * 4] = hash(s, i, 31) * TAU;
        streaks[i * 4 + 1] = ring.r * lerp(0.15, 0.7, hash(s, i, 32));
        streaks[i * 4 + 2] = 4;
        streaks[i * 4 + 3] = 0.7 + hash(s, i, 33) * 0.5;
        streakCount += 1;
      }
      // A soft flash peaking at about seventy per cent.
      const fx = (t - DIVE * 0.72) / 0.11;
      flashLevel = 0.82 * Math.exp(-fx * fx);
      if (t >= DIVE) {
        phase = "await";
        phaseAt = clock;
        const go = commit;
        commit = null;
        go?.();
      }
    } else if (phase === "await") {
      const fx = (t + DIVE * 0.28) / 0.13;
      flashLevel = 0.82 * Math.exp(-fx * fx);
      // A host that refuses the move: re-form showing the same place.
      if (t > 0.4) beginReform();
    } else if (phase === "reform") {
      flashLevel = Math.max(0, flashLevel - dt * 3);
      const kk = springs.glide.stiffness / springs.glide.mass;
      const cc = springs.glide.damping / springs.glide.mass;
      const sub = Math.ceil(dt / (1 / 240));
      for (let k = 0; k < sub; k += 1) {
        const h = dt / sub;
        ringV += (-kk * (ringScale - 1) - cc * ringV) * h;
        ringScale += ringV * h;
      }
      ringAlpha = Math.min(1, ringAlpha + dt * 4);
      if (t > 0.55 && holdClear > 0) {
        // Where you came from, held a beat; then the mercury flows back.
        holdClear = 0;
        if (!pointer.in && !pointer.focus) clearing.target = 0;
        mercuryTarget = 1;
      }
      if (
        t > 0.6 &&
        Math.abs(ringScale - 1) < 0.002 &&
        Math.abs(ringV) < 0.01
      ) {
        ringScale = 1;
        ringV = 0;
        streakCount = 0;
        phase = "idle";
      }
    }
  };

  function beginReform() {
    phase = "reform";
    phaseAt = clock;
    streakCount = Math.min(streakCount, MAX_STREAKS);
    const c = cfg;
    if (!c?.motionSafe) {
      ringScale = 1;
      ringV = 0;
      ringAlpha = 1;
      flashLevel = 0;
    } else {
      ringScale = 0.5;
      ringV = 0;
      ringAlpha = 0.2;
    }
    // The ring comes back clear, showing where you came from.
    clearing.x = ring.x;
    clearing.y = ring.y;
    clearing.r = ring.r * 0.9;
    clearing.v = 0;
    clearing.target = ring.r * 0.9;
    mercury = c?.motionSafe ? 1 : 0;
    mercuryTarget = c?.motionSafe ? 1 : 0;
    holdClear = 1;
    onReform();
  }

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const active = busy();
    if (!active && last && now - drawnAt < IDLE_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    step(dt);
    draw();
    if (ambient() || busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!ambient() && !busy()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const spawn = (x: number, y: number, strength: number) => {
    const c = cfg;
    if (!c || !c.motionSafe || c.ripple <= 0) return;
    const i = slot;
    slot = (slot + 1) % RIPPLES;
    ripples[i * 4] = x;
    ripples[i * 4 + 1] = y;
    ripples[i * 4 + 2] = 0;
    ripples[i * 4 + 3] = clamp(strength, 0.2, 1);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const rgb = (o: number) =>
      `rgb(${Math.round((colours[o] ?? 1) * 255)}, ${Math.round((colours[o + 1] ?? 1) * 255)}, ${Math.round((colours[o + 2] ?? 1) * 255)})`;
    glowRgb = rgb(3);
    streakRgb = rgb(12);
    statics();
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    measure();
    const cap = clamp(c.dpr, 0.5, 2);
    size.scale = Math.min(window.devicePixelRatio || 1, cap);
    refs.fx.width = Math.max(1, Math.round(size.w * size.scale));
    refs.fx.height = Math.max(1, Math.round(size.h * size.scale));
    const p = gpu;
    if (p && !p.lost) {
      resizeGL(p.gl, refs.gl, { dprCap: cap });
      statics();
    }
    if (phase === "idle") {
      clearing.x = ring.x;
      clearing.y = ring.y;
    }
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
      if (!was) {
        measure();
        for (let i = 0; i < MAX_MOTES; i += 1) seedMote(i, true);
        time = 2 + hash(Math.round(next.seed), 5) * 6;
      }
      if (!next.motionSafe) {
        // Reduced motion: no ripples, the clearing is a cross-fade of the mercury.
        ripples.fill(0);
        mercuryTarget =
          pointer.in || pointer.focus
            ? 0.12
            : phase === "idle"
              ? 1
              : mercuryTarget;
        clearing.target = 0;
      }
      if (!failed && !gpu) {
        if (!start()) {
          failed = true;
          root.setAttribute("data-fallback", "");
          readColours();
          resize();
        } else {
          detach = onContextLoss(
            refs.gl,
            () => {
              if (gpu) gpu.lost = true;
              root.removeAttribute("data-live");
            },
            () => {
              gpu = null;
              if (!disposed && start()) kick();
            },
          );
        }
        kick();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
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
    hover(x, y) {
      const c = cfg;
      if (!c) return;
      if (x === null || y === null) {
        pointer.in = false;
        if (phase === "idle") {
          clearing.target = 0;
          if (!c.motionSafe && !pointer.focus) mercuryTarget = 1;
        }
        kick();
        return;
      }
      const rr = root.getBoundingClientRect();
      const lx = x - rr.left;
      const ly = y - rr.top;
      if (!pointer.in) {
        pointer.lastX = lx;
        pointer.lastY = ly;
        clearing.x = lx;
        clearing.y = ly;
        spawn(lx, ly, 0.8);
      }
      pointer.in = true;
      pointer.x = lx;
      pointer.y = ly;
      pointer.travel += Math.hypot(lx - pointer.lastX, ly - pointer.lastY);
      pointer.lastX = lx;
      pointer.lastY = ly;
      if (pointer.travel > 16) {
        spawn(lx, ly, pointer.travel / 40);
        pointer.travel = 0;
      }
      if (phase === "idle") {
        clearing.target = ring.r * 0.9 * lerp(0.7, 1.02, clamp(c.ripple, 0, 1));
        if (!c.motionSafe) mercuryTarget = 0.12;
      }
      kick();
    },
    focus(on) {
      const c = cfg;
      if (!c) return;
      pointer.focus = on;
      if (phase === "idle") {
        if (on) {
          clearing.x = ring.x;
          clearing.y = ring.y;
          clearing.target =
            ring.r * 0.9 * lerp(0.7, 1.02, clamp(c.ripple, 0, 1));
          spawn(ring.x, ring.y, 0.9);
          if (!c.motionSafe) mercuryTarget = 0.12;
        } else if (!pointer.in) {
          clearing.target = 0;
          if (!c.motionSafe) mercuryTarget = 1;
        }
      }
      kick();
    },
    retarget() {
      spawn(ring.x, ring.y, 1);
      kick();
    },
    dive(go) {
      const c = cfg;
      if (!c || phase !== "idle") return false;
      measure();
      if (!c.motionSafe) {
        // Reduced motion: the scene behind the ring cross-fades over the card.
        phase = "fade";
        phaseAt = clock;
        commit = null;
        ringScale = (maxReach() / Math.max(1, ring.r * 0.9)) * 1.12;
        portal.style.opacity = "0";
        writePortal();
        portal.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: durations.slow * 1000,
          easing: `cubic-bezier(${easings.enter.join(", ")})`,
        }).onfinish = () => {
          portal.style.opacity = "";
          if (disposed) return;
          phase = "await";
          phaseAt = clock;
          go();
        };
        kick();
        return true;
      }
      phase = "dive";
      phaseAt = clock;
      commit = go;
      streakCount = 0;
      ripples.fill(0);
      kick();
      return true;
    },
    swapped() {
      if (phase === "await") beginReform();
      writePortal();
      draw();
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

/* -------------------------------- component ------------------------------- */

/**
 * A metal ring hanging in a place, with a membrane of liquid mercury across
 * it — a WebGL2 height field shaded as a near-perfect mirror of the
 * surroundings, slowly wobbling — drawing a faint stream of motes in from the
 * card's edges. Hover it, or focus it, and ripples run out from the pointer
 * while the mercury parts on the springs.glide constants into a clear disc
 * with a beaded edge: through it you see the place the gate leads to.
 *
 * A click or Enter dives through: the ring draws back for a breath, then the
 * gate rushes past you on an accelerating tween while streaks pour outward and
 * a soft flash peaks; the destination fills the card and the value changes.
 * The ring re-forms behind you on springs.glide, still clear and showing
 * where you came from, then the mercury flows back in on springs.drift. Small
 * marks under it are a radiogroup of where it can lead; arrow keys on the gate
 * cycle them. Under reduced motion the mercury cross-fades and a dive is a
 * cross-fade from place to place.
 */
export function MercuryGate({
  destinations = defaultMercuryGateDestinations,
  value,
  defaultValue,
  onValueChange,
  target,
  defaultTarget,
  onTargetChange,
  onDive,
  ripple = 0.55,
  glow = 0.5,
  pull = 0.5,
  ringSize = 0.8,
  metalColor = "oklch(from var(--accent) 0.9 0.02 h)",
  glowColor = "var(--accent-bright)",
  showLabels = true,
  sound = false,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Go through",
  disabled = false,
  className,
}: MercuryGateProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const marksId = `${uid}-marks`;
  const list =
    destinations.length > 0 ? destinations : defaultMercuryGateDestinations;

  const first = list[0]?.id ?? "";
  const [ownValue, setOwnValue] = React.useState(defaultValue ?? first);
  const here = list.find((d) => d.id === (value ?? ownValue)) ?? list[0];
  const hereId = here?.id ?? first;
  const nextOf = (id: string) => {
    const i = list.findIndex((d) => d.id === id);
    return list[(i + 1) % list.length]?.id ?? id;
  };
  const [ownTarget, setOwnTarget] = React.useState(
    defaultTarget ?? nextOf(defaultValue ?? first),
  );
  const rawTarget = target ?? ownTarget;
  const there =
    list.find((d) => d.id === rawTarget && d.id !== hereId) ??
    list.find((d) => d.id === nextOf(hereId)) ??
    list[0];
  const thereId = there?.id ?? first;
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [diving, setDiving] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const fxRef = React.useRef<HTMLCanvasElement | null>(null);
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const flashRef = React.useRef<HTMLDivElement | null>(null);
  const gateRef = React.useRef<HTMLButtonElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const marksRef = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const config: Config = {
    colorKey: `${metalColor}|${glowColor}|${toneOf(here)}|${toneOf(there)}`,
    ripple,
    glow,
    pull,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef({ config, audio });

  React.useEffect(() => {
    latest.current = { config, audio };
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const gl = glRef.current;
    const fx = fxRef.current;
    const portal = portalRef.current;
    const flash = flashRef.current;
    const gate = gateRef.current;
    const carriers = carriersRef.current;
    if (!root || !gl || !fx || !portal || !flash || !gate || !carriers) return;
    const e = createEngine(
      { root, gl, fx, portal, flash, gate, carriers },
      visible,
      () => {
        latest.current.audio.play("whoosh", { pitch: 0.7, gain: 0.32 });
        setDiving(false);
      },
    );
    engine.current = e;
    e.configure(latest.current.config);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) e.wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // The scenes swap in the same paint as the engine re-forms the ring.
  const shownHere = React.useRef(hereId);
  React.useLayoutEffect(() => {
    if (shownHere.current === hereId) return;
    shownHere.current = hereId;
    engine.current?.swapped();
  }, [hereId]);

  const pointTo = (id: string, focusMark = false) => {
    if (disabled || id === thereId || id === hereId) return;
    if (target === undefined) setOwnTarget(id);
    onTargetChange?.(id);
    engine.current?.retarget();
    const dest = list.find((d) => d.id === id);
    setSaid((v) => ({
      n: v.n + 1,
      text: `The gate leads to ${dest?.title ?? id}.`,
    }));
    if (focusMark) marksRef.current[id]?.focus();
  };

  const cycle = (dir: number, focusMark = false) => {
    const options = list.filter((d) => d.id !== hereId);
    if (options.length < 2) return;
    const i = options.findIndex((d) => d.id === thereId);
    const next = options[(i + dir + options.length) % options.length];
    if (next) pointTo(next.id, focusMark);
  };

  const go = () => {
    if (disabled || diving || !there || thereId === hereId) return;
    const from = hereId;
    const to = thereId;
    const started = engine.current?.dive(() => {
      // At the peak of the dive: you have arrived, and the gate now leads back.
      if (value === undefined) setOwnValue(to);
      if (target === undefined) setOwnTarget(from);
      onValueChange?.(to);
      onTargetChange?.(from);
      setSaid((v) => ({ n: v.n + 1, text: `Arrived at ${there.title}.` }));
    });
    if (!started) return;
    setDiving(true);
    onDive?.(from, to);
    audio.play("whoosh", { pitch: 1, gain: 0.6 });
  };

  const ink = "oklch(0.97 0.01 250)";
  const shade = { textShadow: "0 1px 10px oklch(0.1 0.02 250 / 0.55)" };
  const options = list.filter((d) => d.id !== hereId);

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/mercury-gate relative isolate h-full w-full overflow-clip rounded-3 [contain:paint] select-none",
        className,
      )}
      style={{ containerType: "size" }}
    >
      <Scene dest={here} seed={seed} />
      <div
        ref={portalRef}
        aria-hidden
        className="absolute inset-0"
        style={{ clipPath: "circle(0px at 50% 50%)" }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={thereId}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <Scene dest={there} seed={seed} />
          </motion.div>
        </AnimatePresence>
      </div>
      {/* The stand-in mercury: the server's frame, and the gate without WebGL2. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-300 group-data-live/mercury-gate:hidden @[30rem]:left-[64%]",
          "[--ring-k:0.8] @[30rem]:[--ring-k:0.92]",
          "group-data-clear/mercury-gate:opacity-15 group-data-diving/mercury-gate:opacity-0",
        )}
        style={{
          width: `calc(var(--ring-k) * ${r3(clamp(ringSize, 0.4, 1))} * min(100cqw, 100cqh))`,
          aspectRatio: "1",
          backgroundImage: `radial-gradient(circle at 36% 30%, oklch(0.98 0.01 250), transparent 22%), conic-gradient(from 200deg, oklch(from ${metalColor} 0.45 0.02 h), oklch(from ${metalColor} 0.95 0.01 h), oklch(from ${metalColor} 0.55 0.02 h), oklch(from ${metalColor} 0.85 0.02 h), oklch(from ${metalColor} 0.45 0.02 h))`,
          boxShadow: `0 0 0 ${r1(3)}px oklch(from ${metalColor} 0.8 0.02 h), 0 0 ${r1(18 + glow * 30)}px color-mix(in oklab, ${glowColor} ${Math.round(30 + glow * 50)}%, transparent)`,
        }}
      />
      <canvas
        ref={glRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <canvas
        ref={fxRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        ref={flashRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          backgroundImage: `radial-gradient(circle at 50% 50%, oklch(0.99 0.01 250), color-mix(in oklab, ${toneOf(there)} 30%, oklch(0.98 0.01 250)) 55%, transparent)`,
        }}
      />
      {showLabels ? (
        <>
          <div
            className="pointer-events-none absolute top-3 left-4 hidden max-w-[34%] flex-col gap-0.5 @[30rem]:top-1/2 @[30rem]:flex @[30rem]:-translate-y-1/2"
            style={{ color: ink, ...shade }}
          >
            <p className="font-mono text-[10px] tracking-[0.08em] uppercase opacity-75">
              You are at
            </p>
            <p className="text-lg leading-tight font-semibold tracking-tight text-balance">
              {here?.title}
            </p>
            {here?.caption ? (
              <p className="text-xs opacity-80">{here.caption}</p>
            ) : null}
            <p className="mt-3 font-mono text-[10px] tracking-[0.08em] uppercase opacity-75">
              The gate leads to
            </p>
            <p className="text-sm font-medium">{there?.title}</p>
          </div>
          <p
            className="pointer-events-none absolute top-2.5 right-4 left-4 truncate text-xs font-semibold @[30rem]:hidden"
            style={{ color: ink, ...shade }}
          >
            {here?.title}
          </p>
          <p
            className="pointer-events-none absolute right-16 bottom-3 left-4 truncate font-mono text-[10px] tracking-[0.08em] uppercase @[30rem]:hidden"
            style={{ color: ink, ...shade }}
          >
            To {there?.title}
          </p>
        </>
      ) : null}
      <button
        ref={gateRef}
        type="button"
        data-gate=""
        aria-label={`${label} to ${there?.title ?? ""}`}
        aria-describedby={hintId}
        aria-disabled={disabled || options.length === 0 || undefined}
        onClick={go}
        onPointerMove={(event) => {
          if (event.pointerType === "touch" || disabled) return;
          engine.current?.hover(event.clientX, event.clientY);
        }}
        onPointerLeave={() => engine.current?.hover(null, null)}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible"))
            engine.current?.focus(true);
        }}
        onBlur={() => engine.current?.focus(false)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            cycle(1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            cycle(-1);
          }
        }}
        className={cn(
          "absolute top-1/2 left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full @[30rem]:left-[64%]",
          "[--ring-k:0.8] @[30rem]:[--ring-k:0.92]",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : diving
              ? "cursor-progress"
              : "cursor-pointer",
        )}
        style={{
          width: `calc(var(--ring-k) * ${r3(clamp(ringSize, 0.4, 1))} * min(100cqw, 100cqh))`,
        }}
      />
      {options.length > 1 ? (
        <div
          role="radiogroup"
          aria-labelledby={marksId}
          className="absolute right-3 bottom-1.5 flex items-center"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              cycle(1, true);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              cycle(-1, true);
            }
          }}
        >
          <span id={marksId} className="sr-only">
            The gate leads to
          </span>
          {list.map((d) => {
            const isHere = d.id === hereId;
            const isThere = d.id === thereId;
            return (
              <button
                key={d.id}
                ref={(node) => {
                  marksRef.current[d.id] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isThere}
                aria-disabled={isHere || disabled || undefined}
                aria-label={isHere ? `${d.title}, where you are` : d.title}
                tabIndex={isThere ? 0 : -1}
                onClick={() => pointTo(d.id)}
                className={cn(
                  "group/mercury-mark flex size-6 items-center justify-center rounded-full",
                  "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
                  isHere || disabled ? "cursor-default" : "cursor-pointer",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full border transition-[background-color,transform,opacity] duration-200",
                    isThere
                      ? "scale-125"
                      : "group-hover/mercury-mark:opacity-100",
                    isHere
                      ? "bg-transparent opacity-90"
                      : isThere
                        ? "opacity-100"
                        : "opacity-55",
                  )}
                  style={{
                    borderColor: ink,
                    backgroundColor: isHere ? "transparent" : ink,
                  }}
                />
              </button>
            );
          })}
        </div>
      ) : null}
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[
          metalColor,
          glowColor,
          `oklch(from ${toneOf(here)} 0.16 0.04 h)`,
          `oklch(from ${toneOf(here)} 0.93 0.03 h)`,
          `color-mix(in oklab, ${toneOf(there)} 35%, oklch(0.98 0.01 250))`,
        ].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
            onTransitionEnd={() => engine.current?.readColours()}
          />
        ))}
      </span>
      <p id={hintId} className="sr-only">
        Arrow keys choose where the gate leads; Enter goes through.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
