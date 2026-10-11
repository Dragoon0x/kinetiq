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
import { durations, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type TidalBoreProps = {
  /** How tall the bore stands, 0 (a ripple) to 1 (a breaking wall). The pointer and keys set it live; leaving returns here. @default 0.6 */
  height?: number;
  /** How strongly the crest glows where the low sun shines through it, 0 to 1. @default 0.6 */
  glow?: number;
  /** Seconds between one bore and the next, 4 to 20. @default 9 */
  interval?: number;
  /** How fast the river runs down toward you, 0 (still) to 1. @default 0.5 */
  current?: number;
  /** How hard the river bends, 0 (a straight channel) to 1. @default 0.6 */
  meander?: number;
  /** How much white water breaks at the banks and bends, 0 to 1. @default 0.6 */
  foam?: number;
  /** How late in the evening it is, 0 (golden hour) to 1 (the last light). @default 0.5 */
  dusk?: number;
  /** The low sun's colour: a pigment at a fixed lightness, so it reads the same in both themes. @default "oklch(from var(--warn) 0.8 c h)" */
  sunColor?: string;
  /** The water's own tone, any CSS colour; resolved on the element so it follows the theme. @default "var(--accent)" */
  waterColor?: string;
  /** Show the tide gauge at the right edge, which reads the bore's height. @default true */
  gauge?: boolean;
  /** Content above the river: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The pointer sets the height and a click sends a bore; the keys do both. @default true */
  interactive?: boolean;
  /** Hold the river and its bores where they are. @default false */
  paused?: boolean;
  /** Names the height control for assistive technology. @default "Bore height" */
  label?: string;
  /** Seeds the river's bends, so two rivers never match. @default 2 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a bore starts upriver, with how many have run so far. */
  onBore?: (count: number) => void;
  /** Fires from the pointer or key that set a new height, 0 to 1. */
  onHeightChange?: (height: number) => void;
  /** Shows the river running but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const STEP = 1 / 120;
/** Where a bore enters (just below the frame) and leaves (lost in the haze), in world units upriver. */
const ENTER = 3.2;
const LEAVE = 74;
/** How fast a bore runs upriver, world units a second. */
const PACE = 2.2;
/** Under reduced motion one bore holds here. */
const STILL_FRONT = 10.5;
const MAX_BORES = 3;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const toUnit = (byte: number) => byte / 255;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_bores;
uniform float u_amp;
uniform float u_glow;
uniform float u_foam;
uniform float u_meander;
uniform float u_current;
uniform float u_dusk;
uniform float u_seed;
uniform float u_flash;
uniform float u_dark;
uniform vec3 u_sun;
uniform vec3 u_water;
uniform vec3 u_bg;

const float HC = 5.0;
const float PITCH = 0.5;
const float FOV = 0.46;

// The river: a meandering centreline and a half-width that breathes.
float centre(float z) {
  return u_meander * (2.6 * sin(z * 0.13 + u_seed) + 1.1 * sin(z * 0.31 + 1.7 * u_seed));
}
float bend(float z) {
  return -u_meander * (2.6 * 0.0169 * sin(z * 0.13 + u_seed) + 1.1 * 0.0961 * sin(z * 0.31 + 1.7 * u_seed));
}
float halfW(float z) { return 4.2 + 0.6 * sin(z * 0.07 + 2.0 * u_seed); }

// One bore's height at d, the distance upriver from its front: a steep face,
// the main crest just behind it, a raised level and a train of whelps.
float boreH(float d) {
  // tanh of a large argument overflows on some drivers: clamp it first.
  float S = 0.5 - 0.5 * tanh(clamp(d / 0.5, -9.0, 9.0));
  float c0 = (d + 0.7) / 0.85;
  float crest = exp(-c0 * c0);
  float back = min(d + 1.4, 0.0);
  float whelps = exp(back / 7.0) * (0.5 + 0.5 * cos(1.25 * back)) * smoothstep(-0.8, -1.8, d);
  return 0.42 * S + 0.7 * crest + 0.26 * whelps;
}

float ripple(vec2 g) {
  float t = u_time * (0.3 + 1.6 * u_current);
  return kx_noise(vec2(g.x * 1.6, g.y * 0.7 + t)) + 0.5 * kx_noise(vec2(g.x * 3.4, g.y * 1.5 + t * 1.7));
}

void main() {
  float aspect = u_res.x / u_res.y;
  vec2 uv = (v_uv - 0.5) * vec2(aspect, -1.0) * 2.0;
  vec3 fwd = vec3(0.0, -sin(PITCH), cos(PITCH));
  vec3 up = vec3(0.0, cos(PITCH), sin(PITCH));
  vec3 dir = normalize(vec3(uv.x * FOV, 0.0, 0.0) + up * uv.y * FOV + fwd);

  float elev = 0.12 - 0.1 * u_dusk;
  vec3 L = normalize(vec3(-0.22, sin(elev), cos(elev)));

  // Dusk sky, for reflections and haze: warm at the horizon, deepening up.
  vec3 zenD = mix(u_bg, u_water, 0.45) * 0.85;
  vec3 horD = mix(u_sun, u_water, 0.2 + 0.35 * u_dusk) * (1.0 - 0.35 * u_dusk);
  vec3 zenL = mix(u_bg, u_water, 0.3);
  vec3 horL = mix(u_bg, u_sun, 0.62 - 0.2 * u_dusk);
  vec3 zen = mix(zenL, zenD, u_dark);
  vec3 hor = mix(horL, horD, u_dark);

  float ty = -dir.y;
  float t = HC / max(ty, 1e-3);
  vec2 g = vec2(dir.x * t, dir.z * t);
  float dist = length(g);

  float s = g.x - centre(g.y);
  float W = halfW(g.y);
  float curv = bend(g.y);

  // Every bore on the river: height, slope along the river, crest, trail.
  float h = 0.0;
  float dh = 0.0;
  float crestM = 0.0;
  float lipM = 0.0;
  float trail = 0.0;
  float across = clamp(s / W, -1.2, 1.2);
  for (int i = 0; i < 3; i++) {
    float zb = u_bores[i];
    if (zb < -20.0) continue;
    // The crest leads mid-channel, where the water is deepest, and on the
    // outside of a bend.
    float zf = zb + 0.45 * (1.0 - across * across) - 4.0 * curv * s;
    float d = g.y - zf;
    h += u_amp * boreH(d);
    dh += u_amp * (boreH(d + 0.04) - boreH(d - 0.04)) / 0.08;
    float c0 = (d + 0.7) / 0.85;
    crestM = max(crestM, exp(-c0 * c0));
    float c1 = (d + 0.6) / 0.22;
    lipM = max(lipM, exp(-c1 * c1));
    trail = max(trail, exp(min(d, 0.0) / 3.6) * (0.5 - 0.5 * tanh(clamp(d / 0.5, -9.0, 9.0))));
  }

  // The water climbs the banks a little as the bore passes.
  float edge = W + h * 0.9;
  float db = edge - abs(s);
  float water = smoothstep(-0.04, 0.04, db);

  float e = 0.06;
  float r0 = ripple(g);
  float rx = (ripple(g + vec2(e, 0.0)) - r0) / e;
  float rz = (ripple(g + vec2(0.0, e)) - r0) / e;
  float ra = 0.05 * (1.0 - 0.6 * smoothstep(10.0, 40.0, dist));
  vec3 n = normalize(vec3(-rx * ra, 1.0, -(rz * ra + dh * 1.4)));

  vec3 V = -dir;
  vec3 R = reflect(dir, n);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  float re = max(R.y, 0.0);
  vec3 sky = mix(hor, zen, smoothstep(0.0, 0.55, re));
  sky += u_sun * pow(max(dot(R, L), 0.0), 10.0) * 0.45;
  float spec = pow(max(dot(R, L), 0.0), 700.0) * 7.0;

  // Muted water: the page's tone steeped in the water colour, deeper mid-channel.
  vec3 deep = mix(u_bg, u_water, mix(0.38, 0.5, u_dark)) * mix(0.62, 0.32, u_dark);
  deep = mix(deep, deep * 0.72, smoothstep(0.0, 1.0, db / W));
  // Dusk water mirrors more of the sky than the steep view's angle alone gives.
  vec3 col = mix(deep, sky, clamp(mix(0.22, 1.0, F), 0.0, 1.0));
  col += u_sun * spec;

  // Low sun through the thin crest: the bore glows as it rolls.
  // The face turned toward you is in its own shadow; the lip catches the
  // sun as a bright thread and the thin crest glows behind it.
  col *= 1.0 - clamp(dh * 0.4, 0.0, 0.3);
  col += u_sun * u_glow * lipM * (0.35 + 1.5 * u_amp) * (1.0 + u_flash);
  col += u_sun * u_glow * crestM * (0.06 + 0.22 * u_amp) * (1.0 + u_flash);
  // The raised water behind the crest holds a little of the light too.
  col += u_sun * u_glow * trail * 0.06 * u_amp;

  // White water: where the crest meets the banks and the outer bends, and
  // in its wake, broken up by a moving foam texture.
  float bank = 1.0 - smoothstep(0.0, 1.1, db);
  float outer = clamp(abs(curv) * 18.0, 0.0, 1.0) * step(0.0, s * curv * -1.0);
  float steep = smoothstep(0.25, 0.6, u_amp);
  // Lace: two scales of drifting noise, so the white water breaks into
  // threads and bubbles rather than a flat wash.
  float lace = 0.6 * kx_noise(vec2(g.x * 7.0, g.y * 6.0 - u_time * 1.2))
    + 0.4 * kx_noise(vec2(g.x * 16.0, g.y * 13.0 + u_time * 0.8));
  float foamAmt = crestM * (bank * 1.1 + outer * 0.7 + steep * 0.35) + trail * (bank * 0.6 + steep * 0.12);
  foamAmt = smoothstep(0.55, 0.82, lace * 0.6 + foamAmt * 0.55) * u_foam * min(1.0, u_amp * 3.0);
  vec3 foamC = mix(vec3(0.96), u_sun, 0.22) * mix(1.0, 0.9, u_dark);
  col = mix(col, foamC, clamp(foamAmt, 0.0, 1.0) * water);

  // The banks: wet mud at the edge, scrub behind, a bright waterline.
  float scrub = kx_fbm(g * vec2(1.6, 0.9));
  float tufts = smoothstep(0.35, 0.95, kx_fbm(g * vec2(2.2, 1.3) + 7.0));
  vec3 land = mix(u_bg * 0.5, u_sun * 0.35 + u_water * 0.1, 0.22);
  vec3 mud = land * mix(1.0, 0.62, u_dark);
  vec3 grass = land * mix(0.78, 0.42, u_dark) * (0.82 + 0.36 * scrub) * (1.0 - 0.14 * tufts);
  vec3 ground = mix(mud, grass, smoothstep(0.2, 2.2, -db));
  ground += u_sun * 0.08 * (1.0 - smoothstep(0.0, 1.5, -db)) * (1.0 - u_dark * 0.5);
  float lw = db / 0.07;
  float line = exp(-lw * lw);
  ground = mix(ground, sky, line * 0.5);
  col = mix(ground, col, water);

  // Haze toward the far reach.
  float haze = 1.0 - exp(-max(dist - 8.0, 0.0) / 38.0);
  col = mix(col, hor, haze * 0.92);
  col = mix(col, hor, smoothstep(0.03, 0.0, ty));

  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Size = { w: number; h: number; bw: number; bh: number };

type Sim = {
  last: number;
  carry: number;
  t: number;
  /** Front of each bore, world units upriver; below -20 when none. */
  bores: Float32Array;
  next: number;
  count: number;
  /** The live height and its spring velocity. */
  h: number;
  hv: number;
  flash: number;
};

type Hand = {
  /** The height the visitor is asking for, or null to follow the prop. */
  want: number | null;
  source: "pointer" | "key" | null;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
};

/** Content controls the river must leave alone. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

/**
 * A river seen from above at an angle at dusk, drawn per pixel in one WebGL2
 * pass with your content on top. Screen points are cast onto the water's
 * plane, so the river narrows into a hazy far reach; its centreline
 * meanders, its banks are dark mud and scrub with a bright waterline, and
 * the water mirrors a dusk sky more as it turns away, with the low sun's
 * glitter path.
 *
 * A single long wave — the bore — runs upriver against the current: a steep
 * front, its crest just behind, a raised level and a train of whelps. The low
 * sun shines through the thin crest, so it glows as it rolls; where it meets
 * the banks and the outer side of the bends it breaks into whitecaps, its
 * wake trails foam, and the water climbs the banks as it passes. The next
 * bore enters every `interval` seconds.
 *
 * The pointer sets the bore's height — higher on the river, taller wave — on
 * the glide spring, and leaving eases it back to `height` on the drift
 * spring; a click sends the next bore at once. The height is a real slider
 * for the keyboard: Up and Down set it, Enter or Space sends a bore, Escape
 * hands it back to the prop. Under reduced motion the river is one still
 * frame with a bore held two-fifths up; height redraws it at once and a bore
 * sent is counted with a single fade of the crest's light.
 */
export function TidalBore({
  height = 0.6,
  glow = 0.6,
  interval = 9,
  current = 0.5,
  meander = 0.6,
  foam = 0.6,
  dusk = 0.5,
  sunColor = "oklch(from var(--warn) 0.8 c h)",
  waterColor = "var(--accent)",
  gauge = true,
  children,
  interactive = true,
  paused = false,
  label = "Bore height",
  seed = 2,
  dpr = 2,
  onBore,
  onHeightChange,
  disabled = false,
  className,
}: TidalBoreProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const base = clamp01(height);
  const k = {
    height: base,
    glow: clamp01(glow),
    interval: clamp(interval, 4, 20),
    flow: clamp01(current),
    meander: clamp01(meander),
    foam: clamp01(foam),
    dusk: clamp01(dusk),
    seed: (Math.abs(Math.round(seed)) % 997) * 0.731,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };
  const paints = [sunColor, waterColor, "var(--background)"];
  const paintKey = paints.join("|");

  const [shown, setShown] = React.useState<number | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const live = shown ?? base;
  const percent = Math.round(live * 100);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const markerRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef({
    sun: new Float32Array(3),
    water: new Float32Array(3),
    bg: new Float32Array(3),
    dark: 1,
  });
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const drawn = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    t: 0,
    bores: new Float32Array([ENTER + (LEAVE - ENTER) * 0.12, -99, -99]),
    next: 0,
    count: 1,
    h: base,
    hv: 0,
    flash: 0,
  });
  const hand = React.useRef<Hand>({ want: null, source: null });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onBore, onHeightChange });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

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
    const read = (i: number, out: Float32Array) => {
      const span = carriers.children[i];
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(128, 128, 128)";
      if (span) ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[0] = toUnit(d[0] ?? 0);
      out[1] = toUnit(d[1] ?? 0);
      out[2] = toUnit(d[2] ?? 0);
    };
    const c = colour.current;
    read(0, c.sun);
    read(1, c.water);
    read(2, c.bg);
    const lum = 0.2126 * c.bg[0]! + 0.7152 * c.bg[1]! + 0.0722 * c.bg[2]!;
    c.dark = lum < 0.45 ? 1 : 0;
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const area = canvas.clientWidth * canvas.clientHeight;
    const scale = area > 600_000 ? 0.75 : 1;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr, renderScale: scale });
    size.current = {
      w: r.width / (r.dpr * scale),
      h: r.height / (r.dpr * scale),
      bw: r.width,
      bh: r.height,
    };
  };

  const placeMarker = () => {
    const el = markerRef.current;
    if (!el) return;
    // 1 is the top of the staff, 0 its foot.
    el.style.top = `${Math.round((1 - clamp01(sim.current.h)) * 1000) / 10}%`;
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    const reduced = !k.motionSafe;
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_time ?? null, reduced ? 3.1 : s.t);
    if (reduced) gl.uniform3f(u.u_bores ?? null, STILL_FRONT, -99, -99);
    else gl.uniform3fv(u.u_bores ?? null, s.bores);
    gl.uniform1f(u.u_amp ?? null, 0.05 + 0.5 * clamp01(s.h));
    gl.uniform1f(u.u_glow ?? null, k.glow);
    gl.uniform1f(u.u_foam ?? null, k.foam);
    gl.uniform1f(u.u_meander ?? null, k.meander);
    gl.uniform1f(u.u_current ?? null, k.flow);
    gl.uniform1f(u.u_dusk ?? null, k.dusk);
    gl.uniform1f(u.u_seed ?? null, k.seed);
    gl.uniform1f(u.u_flash ?? null, s.flash);
    gl.uniform1f(u.u_dark ?? null, c.dark);
    gl.uniform3fv(u.u_sun ?? null, c.sun);
    gl.uniform3fv(u.u_water ?? null, c.water);
    gl.uniform3fv(u.u_bg ?? null, c.bg);
    tri.draw();
    placeMarker();
    if (!drawn.current) {
      drawn.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** A new bore at the bottom of the frame. */
  const launch = () => {
    const s = sim.current;
    let slot = -1;
    let oldest = -1;
    let far = -Infinity;
    for (let i = 0; i < MAX_BORES; i += 1) {
      const z = s.bores[i]!;
      if (z < -20 && slot < 0) slot = i;
      if (z > far) {
        far = z;
        oldest = i;
      }
    }
    s.bores[slot >= 0 ? slot : Math.max(0, oldest)] = ENTER;
    s.next = k.interval;
    s.count += 1;
    report.current.onBore?.(s.count);
  };

  /** Steps the bores, the height spring and the flash; true while anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const hd = hand.current;
    const want = hd.want ?? k.height;
    // The visitor's hand moves the height on glide; letting go, it drifts back.
    const sp = hd.want !== null ? springs.glide : springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      s.hv +=
        ((-sp.stiffness * (s.h - want) - sp.damping * s.hv) / sp.mass) * STEP;
      s.h += s.hv * STEP;
    }
    if (steps === 8) s.carry = 0;
    const springing = Math.abs(s.h - want) > 1e-4 || Math.abs(s.hv) > 1e-3;
    if (!springing) {
      s.h = want;
      s.hv = 0;
    }
    s.flash = Math.max(0, s.flash - dt / (durations.slow * 2));
    if (!k.paused) {
      s.t += dt;
      for (let i = 0; i < MAX_BORES; i += 1) {
        const z = s.bores[i]!;
        if (z < -20) continue;
        const next = z + PACE * dt;
        s.bores[i] = next > LEAVE ? -99 : next;
      }
      s.next -= dt;
      if (s.next <= 0) launch();
    }
    return !k.paused || springing || s.flash > 0;
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
    if (!k.motionSafe) {
      // A still river: the height goes straight to its value and only the
      // crest's light fades after a bore is sent.
      s.h = hand.current.want ?? k.height;
      s.hv = 0;
      s.flash = Math.max(0, s.flash - dt / (durations.slow * 2));
      draw();
      if (s.flash > 0) frame.current = window.requestAnimationFrame(loop);
      else s.last = 0;
      return;
    }
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick };
    report.current = { onBore, onHeightChange };
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas);
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
        drawn.current = false;
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
    // The first bore waits a little less than a full interval.
    sim.current.next = Math.min(
      sim.current.next || k.interval * 0.6,
      k.interval,
    );
    api.current?.draw();
    api.current?.kick();
  }, [
    k.height,
    k.glow,
    k.interval,
    k.flow,
    k.meander,
    k.foam,
    k.dusk,
    k.seed,
    paused,
    motionSafe,
  ]);

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

  /** The visitor asks for a height: the river answers, the host hears it. */
  const ask = (next: number, source: "pointer" | "key") => {
    const v = Math.round(clamp01(next) * 100) / 100;
    const hd = hand.current;
    const changed = hd.want === null ? v !== base : v !== hd.want;
    hd.want = v;
    hd.source = source;
    if (changed) {
      setShown(v);
      report.current.onHeightChange?.(v);
    }
    kick();
  };

  /** Hands the height back to the prop. */
  const release = () => {
    const hd = hand.current;
    if (hd.want === null) return;
    hd.want = null;
    hd.source = null;
    setShown(null);
    report.current.onHeightChange?.(base);
    kick();
  };

  const sendBore = () => {
    if (!k.enabled) return;
    if (k.motionSafe) launch();
    else {
      sim.current.count += 1;
      report.current.onBore?.(sim.current.count);
      sim.current.flash = 1;
    }
    setSaid((v) => ({ n: v.n + 1, text: "Bore sent." }));
    kick();
  };

  const heightAt = (clientY: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r || r.height <= 0) return base;
    const fy = (clientY - r.top) / r.height;
    return clamp01((1 - fy) * 1.2 - 0.1);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 6,
    disabled: !k.enabled,
    onMove: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      ask(heightAt(point.y), "pointer");
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "mouse") release();
    },
    onCancel: () => release(),
    onTap: () => sendBore(),
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!k.enabled) return;
    const from = hand.current.want ?? base;
    const steps: Record<string, number> = {
      ArrowUp: 0.05,
      ArrowRight: 0.05,
      ArrowDown: -0.05,
      ArrowLeft: -0.05,
      PageUp: 0.2,
      PageDown: -0.2,
    };
    const by = steps[event.key];
    if (by !== undefined) {
      event.preventDefault();
      ask(from + by, "key");
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      ask(event.key === "Home" ? 0 : 1, "key");
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) sendBore();
      return;
    }
    if (event.key === "Escape" && hand.current.want !== null) {
      event.preventDefault();
      release();
    }
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (!k.enabled || fromContent(event.target)) return;
        drag.onPointerDown(event);
      }}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType !== "mouse" || !k.enabled) return;
        if (fromContent(event.target)) return;
        ask(heightAt(event.clientY), "pointer");
      }}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== "touch" &&
          hand.current.source === "pointer"
        ) {
          release();
        }
      }}
      className={cn(
        "group/tidal-bore relative isolate h-56 w-full overflow-clip bg-background",
        k.enabled ? "touch-pan-x" : "touch-auto",
        className,
      )}
    >
      <RiverStill uid={uid} sunColor={sunColor} waterColor={waterColor} />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
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
      <div
        role="slider"
        tabIndex={k.enabled ? 0 : -1}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`Height ${percent} percent`}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (hand.current.source === "key") release();
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-ns-resize" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      {gauge ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-[18%] right-3 bottom-[18%] w-1.5 rounded-full bg-[repeating-linear-gradient(to_bottom,currentColor_0_1px,transparent_1px_12.5%)] text-foreground/35"
        >
          <span
            ref={markerRef}
            className="absolute -left-1 h-0.5 w-3.5 -translate-y-1/2 rounded-full bg-foreground"
            style={{ top: `${Math.round((1 - base) * 1000) / 10}%` }}
          />
        </span>
      ) : null}
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Up and Down set the bore&apos;s height; Enter or Space sends the next
        bore; Escape hands the height back.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: dark banks closing on a dusk river in perspective, a warm
 * haze over the far reach and one glowing crest across the water.
 */
function RiverStill({
  uid,
  sunColor,
  waterColor,
}: {
  uid: string;
  sunColor: string;
  waterColor: string;
}) {
  const bank = `color-mix(in oklab, ${sunColor} 14%, color-mix(in oklab, var(--background) 52%, black))`;
  const haze = `${uid}-haze`;
  const crest = `${uid}-crest`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/tidal-bore:opacity-0"
    >
      <defs>
        <linearGradient id={haze} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{
              stopColor: `color-mix(in oklab, ${sunColor} 70%, var(--background))`,
            }}
          />
          <stop offset="100%" style={{ stopColor: sunColor }} stopOpacity={0} />
        </linearGradient>
        <radialGradient id={crest}>
          <stop offset="0%" style={{ stopColor: sunColor }} />
          <stop offset="100%" style={{ stopColor: sunColor }} stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect
        width="100"
        height="100"
        style={{
          fill: `color-mix(in oklab, ${waterColor} 34%, var(--background))`,
        }}
      />
      <path d="M0 0H45L31 100H0Z" style={{ fill: bank }} />
      <path d="M55 0H100V100H71Z" style={{ fill: bank }} />
      <ellipse cx="51" cy="56" rx="17" ry="2.4" fill={`url(#${crest})`} />
      <rect width="100" height="34" fill={`url(#${haze})`} />
    </svg>
  );
}
