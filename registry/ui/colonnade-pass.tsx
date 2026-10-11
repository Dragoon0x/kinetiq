"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ColonnadePassProps = {
  /** How closely the columns stand, 3 (wide bays, 7.2 m apart) to 12 (close set, 1.8 m apart). @default 6 */
  columns?: number;
  /** The sun's angle along the walk where it starts, −60° to 60°; changing it moves the sun there. Positive puts the sun to the right, so the bars lean left. @default 25 */
  sunAngle?: number;
  /** How fast you walk past the columns, in metres a second, 0 (standing) to 2.5. @default 1 */
  pace?: number;
  /** The sun's angle when you control it, in degrees; pair with `onValueChange`. */
  value?: number;
  /** Fires from the pointer or the keys that moved the sun, with its new angle in degrees. */
  onValueChange?: (degrees: number) => void;
  /** The sun's height above the horizon where it starts, 12° to 65°; lower suns lay longer bars. @default 34 */
  sunHeight?: number;
  /** How soft the shadows' edges are, 0 (a crisp noon sun) to 1 (thin cloud). @default 0.3 */
  softness?: number;
  /** How much the air inside the portico glows where the sun gets through, 0 to 1. @default 0.35 */
  haze?: number;
  /** Walk with the nearest scroll container as well as on your own. @default false */
  scroll?: boolean;
  /** The stone's colour, any CSS colour. Pigment: daylight reads the same in either theme. @default "oklch(0.84 0.035 78)" */
  stoneColor?: string;
  /** The sunlight's colour, any CSS colour. @default "oklch(0.96 0.06 82)" */
  sunColor?: string;
  /** The sky's colour, which also fills the shade, any CSS colour. @default "oklch(0.84 0.06 235)" */
  skyColor?: string;
  /** Content above the scene: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The first time the colonnade is seen, the sun swings in from the far side and the bars sweep into place. @default true */
  intro?: boolean;
  /** The pointer and keys move the sun. @default true */
  interactive?: boolean;
  /** Stand still; the sun still answers. @default false */
  paused?: boolean;
  /** Names the sun control for assistive technology. @default "Sun angle" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the walk but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const STEP = 1 / 120;
const DEG = Math.PI / 180;
const MAX_ANGLE = 60;
const MIN_ANGLE = -MAX_ANGLE;
const MIN_HEIGHT = 12;
const MAX_HEIGHT = 65;
/** The walker's eye height, the lens (vertical half-field, and a shift down so the floor's bars fill the frame), and where the columns stand. */
const EYE = 1.6;
const TAN_HALF_FOV = Math.tan(20 * DEG);
const LENS_SHIFT = -0.12;
const COLUMN_Z = 5;
/** Where the walk is when it stands still: a column just off centre. */
const REST_X = 0.9;
/** Metres walked for each px the scroll container moves. */
const SCROLL_METRES = 0.012;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** The bars in words, for the slider's reading. */
function describe(degrees: number): string {
  const a = Math.round(degrees);
  const lean =
    a > 3
      ? "bars leaning left"
      : a < -3
        ? "bars leaning right"
        : "bars straight";
  return `${a} degrees, ${lean}`;
}

const FRAGMENT = /* glsl */ `
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform vec4 u_cam;
uniform vec2 u_frame;
uniform vec4 u_geo;
uniform vec3 u_sun;
uniform vec2 u_look;
uniform vec3 u_stone;
uniform vec3 u_sunCol;
uniform vec3 u_sky;

const float H_SHAFT = 4.2;
const float H_TOP = 4.5;
const float EAVE = 0.55;
const float FAR = 18.0;
const float FAR_H = 6.2;
const vec3 LAWN = vec3(0.16, 0.27, 0.1);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// How much sun reaches P, 0 to 1: from under the roof, the ray toward the sun
// must leave between two columns and below the eaves. The penumbra widens with
// the distance to whatever casts it, as a real sun's does.
float sunAt(vec3 P) {
  vec3 L = u_sun;
  float zc = u_geo.y;
  if (P.z <= zc - EAVE) return 1.0;
  float t = (P.z - zc) / max(-L.z, 1e-3);
  vec3 Q = P + L * t;
  float soft = t * (0.0093 + 0.05 * u_look.x) + 0.01;
  float roof = smoothstep(H_TOP - soft, H_TOP + soft, Q.y);
  float S = u_geo.x;
  float i = floor(Q.x / S + 0.5);
  float perp = abs(Q.x - i * S) * abs(L.z) / max(length(L.xz), 1e-3);
  float col = 1.0 - smoothstep(u_geo.w - soft, u_geo.w + soft, perp);
  return (1.0 - roof) * (1.0 - col);
}

bool box(vec3 o, vec3 d, vec3 lo, vec3 hi, out float t, out vec3 n) {
  vec3 inv = 1.0 / d;
  vec3 t0 = (lo - o) * inv;
  vec3 t1 = (hi - o) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  float tn = max(max(tmin.x, tmin.y), tmin.z);
  float tf = min(min(tmax.x, tmax.y), tmax.z);
  t = tn;
  if (tn > tf || tn <= 0.0) return false;
  n = tn == tmin.x ? vec3(-sign(d.x), 0.0, 0.0) : tn == tmin.y ? vec3(0.0, -sign(d.y), 0.0) : vec3(0.0, 0.0, -sign(d.z));
  return true;
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 ndc = vec2((v_uv.x - 0.5) * 2.0 * aspect, (0.5 - v_uv.y) * 2.0);
  // Looking along the walk, turned a little toward the wall; the lens is
  // shifted, not tilted, so every column stays upright.
  float yaw = u_frame.x;
  vec3 fwd = vec3(cos(yaw), 0.0, sin(yaw));
  vec3 right = vec3(-sin(yaw), 0.0, cos(yaw));
  vec3 d = normalize(fwd + right * (ndc.x * u_cam.w) + vec3(0.0, ndc.y * u_cam.w + u_frame.y, 0.0));
  vec3 o = u_cam.xyz;
  float S = u_geo.x;
  float zc = u_geo.y;
  float zw = u_geo.z;
  float rc = u_geo.w;
  vec3 L = u_sun;

  float best = 1e9;
  int id = 0;
  vec3 N = vec3(0.0);
  float t;
  vec3 n;
  if (d.y < 0.0) {
    t = -o.y / d.y;
    best = t; id = 1; N = vec3(0.0, 1.0, 0.0);
  }
  if (d.y > 0.0) {
    t = (H_TOP - o.y) / d.y;
    float cz = o.z + d.z * t;
    if (cz >= zc - EAVE && cz <= zw && t < best) { best = t; id = 3; N = vec3(0.0, -1.0, 0.0); }
  }
  if (d.z > 0.0) {
    t = (zw - o.z) / d.z;
    float wy = o.y + d.y * t;
    if (wy >= 0.0 && wy <= H_TOP && t < best) { best = t; id = 2; N = vec3(0.0, 0.0, -1.0); }
  }
  if (d.z < 0.0) {
    t = (zc - FAR - o.z) / d.z;
    float fy = o.y + d.y * t;
    if (fy >= 0.0 && fy <= FAR_H && t < best) { best = t; id = 7; N = vec3(0.0, 0.0, 1.0); }
    // The columns, walked in order along the ray from the first it can meet.
    float t0 = (zc + 0.5 - o.z) / d.z;
    float t1 = (zc - 0.5 - o.z) / d.z;
    float x0 = o.x + d.x * t0;
    float x1 = o.x + d.x * t1;
    float dir = d.x >= 0.0 ? 1.0 : -1.0;
    float ia = floor(x0 / S + 0.5) - dir;
    for (int k = 0; k < 22; k++) {
      float i = ia + dir * float(k);
      if ((i * S - x1) * dir > S || t0 > best) break;
      vec2 c = vec2(i * S, zc);
      vec2 oc = o.xz - c;
      float a = dot(d.xz, d.xz);
      float b = dot(oc, d.xz);
      float cc = dot(oc, oc) - rc * rc;
      float disc = b * b - a * cc;
      bool hit = false;
      if (disc > 0.0) {
        t = (-b - sqrt(disc)) / a;
        float y = o.y + d.y * t;
        if (t > 0.0 && y > 0.3 && y < H_SHAFT && t < best) {
          best = t; id = 5; hit = true;
          vec2 n2 = normalize(oc + d.xz * t);
          N = vec3(n2.x, 0.0, n2.y);
        }
      }
      if (box(o, d, vec3(c.x - 0.42, 0.0, zc - 0.42), vec3(c.x + 0.42, 0.3, zc + 0.42), t, n) && t < best) {
        best = t; id = 6; N = n; hit = true;
      }
      if (box(o, d, vec3(c.x - 0.46, H_SHAFT, zc - 0.46), vec3(c.x + 0.46, H_TOP, zc + 0.46), t, n) && t < best) {
        best = t; id = 6; N = n; hit = true;
      }
      if (hit) break;
    }
  }

  vec3 col;
  float far = best;
  if (id == 0) {
    float toward = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(L.x, 0.0, L.z))), 0.0);
    col = mix(mix(u_sky, vec3(1.0), 0.45), u_sky, clamp(d.y * 2.5, 0.0, 1.0));
    col += u_sunCol * pow(toward, 6.0) * 0.25;
    far = 60.0;
  } else {
    vec3 P = o + d * best;
    vec3 alb = u_stone;
    float ao = 1.0;
    float vis = 1.0;
    if (id == 1) {
      if (P.z > zc - EAVE - 0.4) {
        vec2 tile = floor(P.xz / 1.1);
        vec2 f = abs(fract(P.xz / 1.1) - 0.5);
        float joint = smoothstep(0.465, 0.49, max(f.x, f.y));
        alb *= (0.88 + 0.1 * hash(tile)) * (1.0 - 0.16 * joint);
        vis = sunAt(P);
        ao = 1.0 - 0.45 * exp(-(zw - P.z) / 0.5);
        float near = abs(P.x - floor(P.x / S + 0.5) * S);
        ao *= 1.0 - 0.35 * exp(-max(length(vec2(near, P.z - zc)) - rc, 0.0) / 0.3);
      } else {
        // The court: a lawn inside a gravel border.
        float lawn = smoothstep(1.4, 1.6, zc - EAVE - P.z);
        alb = mix(u_stone * 0.92, LAWN * (0.9 + 0.2 * hash(floor(P.xz * 2.0))), lawn);
      }
    } else if (id == 2) {
      alb = mix(u_stone, vec3(1.0), 0.22) * (P.y < 0.85 ? 0.88 : 1.0);
      // A door under an arch in every second bay.
      float dx = P.x - (floor(P.x / (2.0 * S)) + 0.5) * 2.0 * S;
      float arch = length(vec2(dx, P.y - 2.2));
      if (abs(dx) < 0.6 && (P.y < 2.2 || arch < 0.6)) alb *= 0.16;
      vis = sunAt(P);
      ao = (1.0 - 0.4 * exp(-P.y / 0.45)) * (1.0 - 0.35 * exp(-(H_TOP - P.y) / 0.6));
    } else if (id == 3) {
      vec2 f = abs(fract(vec2(P.x / (S * 0.5), P.z / 1.0)) - 0.5);
      alb *= 0.92 - 0.16 * smoothstep(0.38, 0.46, max(f.x, f.y));
      vis = 0.0;
      ao = 1.0 - 0.35 * exp(-(zw - P.z) / 0.6);
    } else if (id == 5) {
      // Fluting: twenty shallow grooves turn the normal a little.
      float ph = atan(N.z, N.x);
      float g = sin(ph * 20.0) * 0.22;
      N = normalize(vec3(N.x * cos(g) - N.z * sin(g), 0.0, N.x * sin(g) + N.z * cos(g)));
      ao = 1.0 - 0.25 * exp(-P.y / 0.5);
    } else if (id == 7) {
      // The court's far range, its arcade in its own shade.
      float dx = P.x - (floor(P.x / S) + 0.5) * S;
      float arch = length(vec2(dx, P.y - 2.6));
      alb = mix(u_stone, vec3(1.0), 0.1);
      if (abs(dx) < S * 0.32 && (P.y < 2.6 || arch < S * 0.32)) alb *= 0.35;
      if (P.y > FAR_H - 0.5) alb = vec3(0.32, 0.12, 0.07);
    }
    float inside = id == 7 ? 0.0 : smoothstep(zc - EAVE, zc + 0.8, P.z) * step(P.y, H_TOP + 0.01);
    float lambert = max(dot(N, L), 0.0);
    vec3 direct = u_sunCol * lambert * vis * 2.1;
    vec3 ground = u_stone * u_sunCol * 0.45;
    vec3 amb = mix(ground, u_sky, 0.62 + 0.38 * N.y) * mix(0.62, 0.34, inside);
    // Sunlit stone bounces a warm light up into the portico.
    amb += u_sunCol * u_stone * 0.16 * inside;
    col = alb * (direct + amb) * ao;
  }
  // The air under the roof glows only where the sun gets through.
  if (u_look.y > 0.0) {
    float tout = min(far, 26.0);
    if (d.z < 0.0) tout = min(tout, (zc - EAVE - o.z) / d.z);
    if (d.y > 0.0) tout = min(tout, (H_TOP - o.y) / d.y);
    float lit = 0.0;
    for (int s = 0; s < 8; s++) {
      vec3 P2 = o + d * (tout * (float(s) + 0.5) / 8.0);
      lit += sunAt(P2);
    }
    col += u_sunCol * (lit / 8.0) * min(tout, 26.0) * 0.012 * u_look.y;
  }
  // Distance softens into the day's haze.
  col = mix(col, mix(u_sky, u_sunCol, 0.5) * 0.9, 1.0 - exp(-far / 70.0));
  // Walking through the bars, the eye adjusts a little to each: the scene
  // dims a touch while you stand in sun and opens up in the shade.
  float exposure = mix(1.1, 0.94, sunAt(o));
  col = 1.0 - exp(-col * 1.3 * exposure);
  vec2 q = v_uv - 0.5;
  col *= 1.0 - 0.2 * dot(q, q);
  o_color = vec4(kx_linearToSrgb(clamp(col, 0.0, 1.0)), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Sim = {
  last: number;
  carry: number;
  /** The walk, metres along the colonnade. */
  x: number;
  /** The sun shown: angle along the walk and height, degrees, with their speeds. */
  az: number;
  azV: number;
  el: number;
  elV: number;
  /** The intro's swing runs on the drift spring until it lands. */
  arriving: boolean;
  /** The height the pointer or keys asked for. */
  elTarget: number;
  /** Metres added by the scroll container. */
  scrolled: number;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/** The props a scene must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='tab'],[contenteditable='true']";

/**
 * A walk along a sunlit cloister, ray-cast per pixel in one WebGL2 pass. You
 * walk under the portico, looking along it and a little toward the wall:
 * fluted columns on plinths down the left, a lawn court and its far arcade
 * beyond them, a coffered ceiling, a paved walk and a plastered wall with
 * arched doors on the right. The sun stands over the court and its light
 * comes in between the columns, laying bars of light and shade across the
 * floor and up the wall. Everything is analytic: the columns are an endless
 * repeat of cylinders walked in order along each ray, and a point's shadow is
 * its ray toward the sun crossing the column plane, the penumbra widening with
 * the distance to the column that casts it. The air under the roof glows
 * faintly where the sun gets through, and your eye adjusts a little as you
 * pass from light to shade. Stone, sun and sky are pigments, so it is the same
 * daylight in either theme.
 *
 * You walk at `pace`, and with `scroll` the nearest scroll container walks you
 * too; the near columns sweep past while the far ones creep, and the bars
 * slide under you. The pointer moves the sun — across for its angle, so the
 * bars lean; up and down for its height, so they lengthen — and the sun
 * follows on the glide spring. It is a real slider: arrows, Page Up and Down,
 * Home and End move its angle, Up and Down its height. On first sight the sun
 * swings in from the far side on drift and the bars sweep into place. Under
 * reduced motion you stand still between two columns, and the sun moves at
 * once.
 */
export function ColonnadePass({
  columns = 6,
  sunAngle = 25,
  pace = 1,
  value,
  onValueChange,
  sunHeight = 34,
  softness = 0.3,
  haze = 0.35,
  scroll = false,
  stoneColor = "oklch(0.84 0.035 78)",
  sunColor = "oklch(0.96 0.06 82)",
  skyColor = "oklch(0.84 0.06 235)",
  children,
  intro = true,
  interactive = true,
  paused = false,
  label = "Sun angle",
  dpr = 2,
  disabled = false,
  className,
}: ColonnadePassProps) {
  const motionSafe = useMotionSafe();
  const [own, setOwn] = React.useState(() =>
    clamp(sunAngle, -MAX_ANGLE, MAX_ANGLE),
  );
  // A new `sunAngle` moves the sun there, as a fresh start would.
  const [seenAngle, setSeenAngle] = React.useState(sunAngle);
  if (seenAngle !== sunAngle) {
    setSeenAngle(sunAngle);
    setOwn(clamp(sunAngle, -MAX_ANGLE, MAX_ANGLE));
  }
  const current = Math.round(clamp(value ?? own, -MAX_ANGLE, MAX_ANGLE));
  const paintKey = `${stoneColor}|${sunColor}|${skyColor}`;
  const k = {
    columns: clamp(Math.round(columns), 3, 12),
    target: current,
    pace: clamp(pace, 0, 2.5),
    height: clamp(sunHeight, MIN_HEIGHT, MAX_HEIGHT),
    softness: clamp01(softness),
    haze: clamp01(haze),
    scroll,
    intro,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(9));
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const arrived = React.useRef(false);
  const steering = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    x: REST_X,
    az: current,
    azV: 0,
    el: k.height,
    elV: 0,
    arriving: false,
    elTarget: k.height,
    scrolled: 0,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onValueChange);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  // A new `sunHeight` moves the sun's height there.
  React.useEffect(() => {
    sim.current.elTarget = k.height;
    api.current?.kick();
  }, [k.height]);

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const out = colour.current;
    for (let i = 0; i < 3; i += 1) {
      const span = carriers.children[i];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      if (span) ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[i * 3] = toLinear(d[0] ?? 0);
      out[i * 3 + 1] = toLinear(d[1] ?? 0);
      out[i * 3 + 2] = toLinear(d[2] ?? 0);
    }
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    size.current = {
      w: r.width / r.dpr,
      h: r.height / r.dpr,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
    };
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    const az = s.az * DEG;
    const el = s.el * DEG;
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    // Turned toward the wall just enough to keep the walk's vanishing point
    // in the left of the frame, whatever the box's shape.
    const halfAcross = (sz.w / sz.h) * TAN_HALF_FOV;
    const yaw = Math.atan(0.45 * halfAcross);
    gl.uniform4f(
      u.u_cam ?? null,
      s.x + s.scrolled,
      EYE,
      COLUMN_Z + 1.5,
      TAN_HALF_FOV,
    );
    gl.uniform2f(u.u_frame ?? null, yaw, LENS_SHIFT);
    gl.uniform4f(
      u.u_geo ?? null,
      21.6 / k.columns,
      COLUMN_Z,
      COLUMN_Z + 4,
      0.3,
    );
    gl.uniform3f(
      u.u_sun ?? null,
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      -Math.cos(az) * Math.cos(el),
    );
    gl.uniform2f(u.u_look ?? null, k.softness, k.haze);
    gl.uniform3f(u.u_stone ?? null, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
    gl.uniform3f(u.u_sunCol ?? null, c[3] ?? 0, c[4] ?? 0, c[5] ?? 0);
    gl.uniform3f(u.u_sky ?? null, c[6] ?? 0, c[7] ?? 0, c[8] ?? 0);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Walks and steps the sun's springs; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    if (!k.motionSafe) {
      s.x = REST_X;
      s.az = k.target;
      s.el = s.elTarget;
      s.azV = 0;
      s.elV = 0;
      s.arriving = false;
      return false;
    }
    let busy = false;
    if (!k.paused && k.pace > 0) {
      s.x += k.pace * dt;
      busy = true;
    }
    // The sun follows on glide; the intro swings it in on drift.
    const sp = s.arriving ? springs.drift : springs.glide;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      s.azV +=
        ((-sp.stiffness * (s.az - k.target) - sp.damping * s.azV) / sp.mass) *
        STEP;
      s.elV +=
        ((-sp.stiffness * (s.el - s.elTarget) - sp.damping * s.elV) / sp.mass) *
        STEP;
      s.az += s.azV * STEP;
      s.el += s.elV * STEP;
    }
    if (steps === 8) s.carry = 0;
    const turning =
      Math.abs(s.az - k.target) > 0.02 ||
      Math.abs(s.azV) > 0.05 ||
      Math.abs(s.el - s.elTarget) > 0.02 ||
      Math.abs(s.elV) > 0.05;
    if (turning) busy = true;
    else {
      s.az = k.target;
      s.el = s.elTarget;
      s.azV = 0;
      s.elV = 0;
      s.arriving = false;
    }
    return busy;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** The first sighting: the sun swings in from the far side. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    if (k.intro && k.motionSafe) {
      s.az = k.target > 0 ? -MAX_ANGLE : MAX_ANGLE;
      s.azV = 0;
      s.arriving = true;
    }
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, arrive };
    report.current = onValueChange;
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, lost: false };
      api.current?.readColours();
      api.current?.resize();
      api.current?.draw();
      api.current?.kick();
      return true;
    };
    if (!build()) {
      rootRef.current?.setAttribute("data-fallback", "");
      return;
    }
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        shown.current = false;
        rootRef.current?.removeAttribute("data-live");
      },
      () => {
        gpu.current = null;
        build();
      },
    );
    return () => {
      detach();
      const g = gpu.current;
      gpu.current = null;
      if (g && !g.lost) {
        g.tri.dispose();
        g.program.dispose();
      }
    };
  }, []);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.columns, k.target, k.pace, k.softness, k.haze, paused, motionSafe]);

  // Scroll walking: the nearest scroll container (or the page) walks you on.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!k.scroll || !k.motionSafe || !root) {
      sim.current.scrolled = 0;
      api.current?.draw();
      return;
    }
    let host: HTMLElement | null = root.parentElement;
    while (host) {
      const style = getComputedStyle(host);
      if (
        /(auto|scroll)/.test(style.overflowY) &&
        host.scrollHeight > host.clientHeight
      )
        break;
      host = host.parentElement;
    }
    const target: HTMLElement | Window = host ?? window;
    const read = () =>
      host ? host.scrollTop : (document.scrollingElement?.scrollTop ?? 0);
    const onScroll = () => {
      sim.current.scrolled = read() * SCROLL_METRES;
      api.current?.draw();
    };
    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [k.scroll, k.motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.arrive();
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  /** A new sun angle from the visitor: held here unless the host holds it. */
  const commit = (next: number) => {
    const v = Math.round(clamp(next, -MAX_ANGLE, MAX_ANGLE));
    sim.current.arriving = false;
    if (v === current) return;
    if (value === undefined) setOwn(v);
    report.current?.(v);
  };

  const setHeight = (next: number) => {
    sim.current.elTarget = clamp(next, MIN_HEIGHT, MAX_HEIGHT);
    sim.current.arriving = false;
    if (!k.motionSafe) draw();
    kick();
  };

  /** The sun for a place in the box: across is its angle, up its height. */
  const steer = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    const u = clamp((clientX - r.left) / r.width, 0, 1);
    const v = clamp((clientY - r.top) / r.height, 0, 1);
    commit((u - 0.5) * 2 * MAX_ANGLE);
    setHeight(MAX_HEIGHT - v * (MAX_HEIGHT - MIN_HEIGHT));
  };

  const drag = useDrag({
    threshold: 2,
    disabled: !k.enabled,
    onStart: ({ point }) => {
      steering.current = true;
      steer(point.x, point.y);
    },
    onMove: ({ point }) => steer(point.x, point.y),
    onEnd: () => {
      steering.current = false;
    },
    onCancel: () => {
      steering.current = false;
    },
    onTap: (event) => steer(event.clientX, event.clientY),
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!k.enabled || fromContent(event.target)) return;
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    // A mouse steers by hovering; touch and pen steer while they drag.
    if (
      !k.enabled ||
      steering.current ||
      event.pointerType !== "mouse" ||
      event.buttons !== 0 ||
      fromContent(event.target)
    )
      return;
    steer(event.clientX, event.clientY);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!k.enabled) return;
    const steps: Record<string, number> = {
      ArrowRight: 2,
      ArrowLeft: -2,
      PageUp: 10,
      PageDown: -10,
    };
    const by = steps[event.key];
    if (by !== undefined) {
      event.preventDefault();
      commit(current + by);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      commit(event.key === "Home" ? -MAX_ANGLE : MAX_ANGLE);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setHeight(sim.current.elTarget + (event.key === "ArrowUp" ? 3 : -3));
    }
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/colonnade-pass relative isolate h-56 w-full overflow-clip",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <ColonnadeStill
        columns={k.columns}
        angle={current}
        stone={stoneColor}
        sun={sunColor}
        sky={skyColor}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/colonnade-pass:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[stoneColor, sunColor, skyColor].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div
        role="slider"
        tabIndex={k.enabled ? 0 : -1}
        aria-label={label}
        aria-valuemin={MIN_ANGLE}
        aria-valuemax={MAX_ANGLE}
        aria-valuenow={current}
        aria-valuetext={describe(current)}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-crosshair" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the walk as CSS gradients — the ceiling, the bright court
 * through the columns on the left, the wall striped with light on the right
 * and the floor's bars leaning toward the far end.
 */
function ColonnadeStill({
  columns,
  angle,
  stone,
  sun,
  sky,
}: {
  columns: number;
  angle: number;
  stone: string;
  sun: string;
  sky: string;
}) {
  const shade = `color-mix(in oklab, ${stone} 55%, oklch(0.36 0.03 250))`;
  const lit = `color-mix(in oklab, ${stone} 72%, ${sun})`;
  const bay = `${Math.round(240 / columns)}%`;
  const lean = Math.round(100 + angle * 0.5);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/colonnade-pass:opacity-0"
      style={{ backgroundColor: shade }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[16%]"
        style={{ backgroundColor: `color-mix(in oklab, ${shade} 80%, black)` }}
      />
      <div
        className="absolute top-[16%] bottom-[30%] left-0 w-[16%]"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${sky} 0%, color-mix(in oklab, ${sky} 60%, white) 45%, oklch(0.62 0.09 140) 46%, oklch(0.58 0.09 140) 100%)`,
        }}
      />
      <div
        className="absolute top-[16%] bottom-[30%] left-0 w-[30%]"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${shade} 0 6%, transparent 6% 18%)`,
        }}
      />
      <div
        className="absolute top-[38%] right-0 bottom-[30%] left-[30%]"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, ${lit} 0 calc(${bay} * 0.55), transparent calc(${bay} * 0.55) ${bay})`,
        }}
      />
      <div
        className="absolute inset-x-0 top-[70%] bottom-0"
        style={{
          backgroundColor: lit,
          backgroundImage: `repeating-linear-gradient(${lean}deg, transparent 0 30px, ${shade} 30px 52px)`,
        }}
      />
      <div
        className="absolute top-[30%] left-[18%] size-[8%] rounded-full blur-md"
        style={{ backgroundColor: `color-mix(in oklab, ${sun} 70%, white)` }}
      />
    </div>
  );
}
