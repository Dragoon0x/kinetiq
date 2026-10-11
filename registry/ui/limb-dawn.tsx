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
import { easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LimbDawnPhase = "night" | "airglow" | "crest" | "ring" | "dawn";
export type LimbDawnTrigger = "mount" | "inView" | "scroll" | "manual";

export type LimbDawnProps = {
  /** The line the dawn comes up behind. @default "Waylight" */
  headline?: string;
  /** A short line above the headline; an empty string leaves it out. @default "First light over the north" */
  eyebrow?: string;
  /** The headline's element. @default "h2" */
  as?: "h1" | "h2" | "h3" | "p";
  /** Content under the headline: a line of copy, a call to action. */
  children?: React.ReactNode;
  /** How round the world is, 0 (an almost flat horizon) to 1 (a small world). @default 0.5 */
  curvature?: number;
  /** How thick and bright the air at the limb glows, 0 to 1. @default 0.5 */
  atmosphere?: number;
  /** How bright the crest's ring of light and the sun's glare burn, 0 to 1. @default 0.6 */
  flare?: number;
  /** The dawn's progress, 0 (night) to 1 (sunrise). Given, it drives the scene and the trigger is ignored. */
  progress?: number;
  /** What walks the dawn: mounting, coming into view, scrolling it up its scroll container, or `progress` alone. @default "inView" */
  trigger?: LimbDawnTrigger;
  /** How long the autoplayed dawn takes, ms. @default 4200 */
  duration?: number;
  /** A pause before it starts, ms. @default 200 */
  delay?: number;
  /** Play once (true) or each time it comes back into view (false). @default true */
  once?: boolean;
  /** Where along the limb the sun comes up, 0 (left) to 1 (right). @default 0.64 */
  sunAt?: number;
  /** How many stars hang over the limb, 0 (none) to 1. @default 0.5 */
  stars?: number;
  /** The air's colour before sunrise; taken at a fixed lightness per theme. @default "var(--accent-bright)" */
  airColor?: string;
  /** The band's colour at sunrise; taken at a fixed lightness per theme. @default "var(--warn)" */
  dawnColor?: string;
  /** The pointer drifts the camera a few pixels, so the orbit has depth. @default true */
  interactive?: boolean;
  /** Hold the stars' twinkle; the dawn itself still plays. @default false */
  paused?: boolean;
  /** Seeds the star field. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires as the dawn passes from one beat to the next. */
  onPhaseChange?: (phase: LimbDawnPhase) => void;
  /** Fires when the dawn has played through. */
  onComplete?: () => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
};

/** Soft light all through: half the capped pixel ratio, scaled up by the browser. */
const RENDER_SCALE = 0.5;
const STEP = 1 / 240;
/** The settled sky twinkles at twenty frames a second, no more. */
const CALM_FRAME = 49;
/** Where the limb's crown sits, as a share of the height. */
const APEX = 0.74;
/** The beats along the progress value. */
const CREST = 0.55;
const RING_END = 0.72;
const [E1, E2, E3, E4] = easings.enter;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pct = (v: number) => Math.round(v * 1000) / 10;

/** The house enter curve as a function, for the ring's expansion. */
function enterEase(t: number): number {
  let u = t;
  for (let i = 0; i < 5; i += 1) {
    const x =
      3 * (1 - u) * (1 - u) * u * E1 + 3 * (1 - u) * u * u * E3 + u * u * u;
    const dx =
      3 * (1 - u) * (1 - u) * E1 +
      6 * (1 - u) * u * (E3 - E1) +
      3 * u * u * (1 - E3);
    if (Math.abs(dx) < 1e-6) break;
    u = clamp(u - (x - t) / dx, 0, 1);
  }
  return 3 * (1 - u) * (1 - u) * u * E2 + 3 * (1 - u) * u * u * E4 + u * u * u;
}

const phaseOf = (p: number): LimbDawnPhase =>
  p < 0.1
    ? "night"
    : p < CREST
      ? "airglow"
      : p < CREST + 0.03
        ? "crest"
        : p < RING_END
          ? "ring"
          : "dawn";

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

/** The world's radius as a share of the width: a near-flat horizon to a small world. */
const radiusOf = (curvature: number) =>
  4.6 - 3.95 * Math.pow(clamp(curvature, 0, 1), 0.7);

/** Pigments at a fixed lightness so the light reads the same on any page. */
const airOf = (c: string) => `oklch(from ${c} 0.7 calc(c * 0.9) h)`;
const dawnOf = (c: string) => `oklch(from ${c} 0.82 c h)`;
const sunOf = (c: string) => `oklch(from ${c} 0.98 calc(c * 0.18) h)`;

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_time;
uniform float u_p;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_air;
uniform vec3 u_dawn;
uniform vec3 u_sun;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_sunAngle;
uniform float u_sunR;
uniform float u_sunAlt;
uniform float u_thick;
uniform float u_atmo;
uniform float u_flare;
uniform float u_ring;
uniform float u_stars;
uniform float u_seed;
uniform vec2 u_cam;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

void main() {
  vec2 frag = v_uv * u_size;
  float p = u_p;
  // The limb is nearest the eye: it drifts the most with the camera.
  vec2 q = frag - u_cam;
  vec2 rel = q - u_center;
  float r = length(rel);
  float alt = r - u_radius;
  float ang = atan(rel.x, -rel.y);
  float along = (ang - u_sunAngle) * u_radius;
  float w = u_size.x;
  float h = u_size.y;
  float aa = 0.9;
  float inside = smoothstep(aa, -aa, alt);

  // Beats from the one value.
  float glowIn = 0.14 + 0.86 * smoothstep(0.0, 0.3, p);
  float pre = smoothstep(0.22, 0.55, p);
  float warm = smoothstep(0.6, 1.0, p);
  float ringT = clamp((p - ${CREST.toFixed(2)}) / ${(RING_END - CREST).toFixed(2)}, 0.0, 1.0);
  float ringOn = step(${CREST.toFixed(2)}, p) * (1.0 - step(1.0, ringT));

  // Space, then a few stars; dawn washes the ones near the sun out.
  vec3 bg = lin(u_bg);
  vec3 fg = lin(u_fg);
  vec3 space = u_light > 0.5 ? mix(bg, fg, 0.015 + 0.04 * v_uv.y) : bg * mix(0.38, 0.6, v_uv.y);
  vec3 col = space;
  vec2 sq = frag - u_cam * 0.3;
  vec2 cell = floor(sq / 17.0);
  float hs = hash(cell + u_seed);
  if (u_light < 0.5 && hs < u_stars * 0.55) {
    vec2 at = (cell + vec2(hash(cell + 7.1 + u_seed), hash(cell + 3.7 + u_seed))) * 17.0;
    float d = length(sq - at);
    float tw = 0.65 + 0.35 * sin(u_time * (0.6 + 1.6 * hash(cell + 1.3)) + hs * 40.0);
    float mag = pow(hash(cell + 9.9), 3.0);
    float wash = 1.0 - 0.85 * warm * exp(-length(q - u_center - vec2(sin(u_sunAngle), -cos(u_sunAngle)) * u_radius) / (w * 0.35));
    col += vec3(0.9, 0.93, 1.0) * (0.15 + 1.1 * mag) * tw * wash * exp(-d * d * 1.4) * (1.0 - inside);
  }

  // The night side: almost the sky's own dark, a breath lighter toward the limb.
  vec3 planet = u_light > 0.5 ? mix(bg, fg, 0.075) : bg * 0.2 + fg * 0.0015;
  planet *= 1.0 + (u_light > 0.5 ? -0.05 : 0.25) * exp(alt / (h * 0.22));
  col = mix(col, planet, inside);

  // The sun on the limb's tangent, its centre walking up along the normal.
  vec2 nrm = vec2(sin(u_sunAngle), -cos(u_sunAngle));
  vec2 sunC = u_center + nrm * (u_radius + u_sunAlt) + u_cam * 0.2;
  float sd = length(frag - sunC);

  // The air: a thin band hugging the limb with a hairline airglow above it.
  float H = u_thick;
  float band = exp(-max(alt, 0.0) / H) * smoothstep(-1.6, 0.6, alt) + 0.35 * exp(alt / (H * 0.5)) * inside;
  float hair = exp(-pow((alt - H * 2.1) / (H * 0.32), 2.0)) * 0.42;
  float L1 = mix(w * 0.06, w * 0.55, pre);
  float near = exp(-pow(along / L1, 2.0));
  float Lw = mix(w * 0.04, w * 0.42, warm);
  float warmNear = exp(-pow(along / Lw, 2.0)) * warm;
  float airI = (glowIn * 0.55 + pre * near * 1.6) * (0.5 + 0.9 * u_atmo);
  vec3 air = lin(u_air);
  vec3 dawn = lin(u_dawn);
  vec3 sun = lin(u_sun);
  vec3 airCol = mix(air, dawn, clamp(warmNear * 1.4, 0.0, 1.0));
  vec3 light = airCol * band * (airI + warmNear * 2.4 * (0.6 + 0.8 * u_atmo));
  light += air * hair * glowIn * (1.0 - 0.5 * warm);
  // Near the sun the band burns toward white.
  light += sun * band * warmNear * warmNear * 0.9;

  // The sun: hidden by the world until it crests, then a hot point.
  float crest = smoothstep(${(CREST - 0.02).toFixed(2)}, ${(CREST + 0.01).toFixed(2)}, p);
  float disc = smoothstep(u_sunR + 0.8, u_sunR - 0.8, sd) * (1.0 - inside) * crest;
  float pin = exp(-pow(length(frag - (u_center + nrm * u_radius + u_cam * 0.2)) / 2.2, 2.0)) * crest * (1.0 - smoothstep(0.0, 0.5, ringT)) * 2.5;
  // The glare is the lens's, but the world in front of the sun still holds most of it back.
  float glare = exp(-sd / (u_sunR * (2.0 + 4.0 * u_flare))) * crest * (0.35 + 0.65 * u_flare) * (1.0 - 0.7 * inside);
  // The ring: a halo expanding round the sun on the enter curve, and a flash running both ways along the limb.
  float ringR = mix(u_sunR * 1.6, h * 0.5, u_ring);
  float ringW = mix(1.2, 5.0, u_ring);
  float fade = pow(1.0 - ringT, 1.6) * smoothstep(0.0, 0.06, ringT) * ringOn;
  float halo = exp(-pow((sd - ringR) / ringW, 2.0)) * fade * u_flare * 1.4;
  float arcL = mix(6.0, w * 0.7, u_ring);
  float arc = exp(-pow(alt / (H * 0.9), 2.0)) * smoothstep(arcL, arcL * 0.4, abs(along)) * fade * u_flare * 2.2;
  float burst = exp(-sd / (h * 0.16)) * fade * u_flare * 0.8;

  float hot = disc * 3.0 + pin + glare * 0.9 + halo + arc + burst;
  vec3 sunLight = sun * hot + dawn * (glare * 0.6 + burst * 0.5 + arc * 0.4);

  if (u_light < 0.5) {
    col += light + sunLight;
    col = 1.0 - exp(-col * 1.15);
  } else {
    // On a pale page the light tints the paper and the sun is drawn by its warm halo.
    float tint = clamp(1.0 - exp(-dot(light, vec3(0.3, 0.5, 0.2)) * 0.9), 0.0, 0.8);
    col = mix(col, airCol, tint * 0.75);
    float ink = clamp(glare * 0.55 + halo * 0.9 + arc * 0.7 + burst * 0.5, 0.0, 0.85);
    col = mix(col, dawn * 0.9, ink);
    col = mix(col, vec3(1.0), clamp(disc * 1.2 + pin * 0.5, 0.0, 1.0));
  }
  outColor = vec4(srgb(col), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  colorKey: string;
  curvature: number;
  atmosphere: number;
  flare: number;
  progress: number | undefined;
  trigger: LimbDawnTrigger;
  duration: number;
  delay: number;
  once: boolean;
  sunAt: number;
  stars: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onPhase: (phase: LimbDawnPhase) => void;
  onComplete: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  seen: (inView: boolean) => void;
  scrolled: () => void;
  hand: (x: number | null, y: number) => void;
  dispose: () => void;
};

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
  let light = 0;
  const read = rgbReader();
  const colours = new Float32Array(15);
  const size = { w: 0, h: 0 };
  const sim = { t: 0 };
  /** The dawn: where it is, where autoplay started it, and whether it has played. */
  const dawn = {
    p: 1,
    playing: false,
    startAt: 0,
    from: 0,
    played: false,
    phase: "dawn" as LimbDawnPhase,
    done: true,
  };
  const camX = { x: 0, v: 0, target: 0 };
  const camY = { x: 0, v: 0, target: 0 };

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

  const geometry = (c: Config) => {
    const { w, h } = size;
    const R = Math.max(h * 0.9, w * radiusOf(c.curvature));
    const cx = w / 2;
    const cy = h * APEX + R;
    const xs = clamp(c.sunAt, 0.05, 0.95) * w;
    const angle = Math.asin(clamp((xs - cx) / R, -0.95, 0.95));
    const sunR = clamp(h * 0.03, 2.5, 8);
    const thick =
      clamp(h * 0.018, 2, 7) * (0.6 + 1.1 * clamp(c.atmosphere, 0, 1));
    return { R, cx, cy, angle, sunR, thick };
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const g = geometry(c);
    const col = (i: number) => [
      colours[i * 3] ?? 0,
      colours[i * 3 + 1] ?? 0,
      colours[i * 3 + 2] ?? 0,
    ];
    p.program.set({
      u_size: [size.w, size.h],
      u_light: light,
      u_bg: col(0),
      u_fg: col(1),
      u_air: col(2),
      u_dawn: col(3),
      u_sun: col(4),
      u_center: [g.cx, g.cy],
      u_radius: g.R,
      u_sunAngle: g.angle,
      u_sunR: g.sunR,
      // A pale page shows the band as a crisper line.
      u_thick: g.thick * (light ? 0.6 : 1),
      u_atmo: clamp(c.atmosphere, 0, 1),
      u_flare: clamp(c.flare, 0, 1),
      u_stars: clamp(c.stars, 0, 1),
      u_seed: (Math.round(c.seed) % 97) * 1.37,
    });
  };

  /** The sun's centre above (+) or below (−) the limb, px, for progress p. */
  const sunAlt = (p: number, sunR: number) => {
    if (p < 0.3) return -sunR * 3.5;
    if (p < CREST) return -sunR * (3.5 - 2.5 * ((p - 0.3) / (CREST - 0.3)));
    const t = (p - CREST) / (1 - CREST);
    return -sunR + 2.6 * sunR * (1 - (1 - t) * (1 - t));
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const g = geometry(c);
    const ringT = clamp((dawn.p - CREST) / (RING_END - CREST), 0, 1);
    program.set({
      u_time: sim.t,
      u_p: dawn.p,
      u_sunAlt: sunAlt(dawn.p, g.sunR),
      u_ring: enterEase(ringT),
      u_cam: [camX.x, camY.x],
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    // The words catch the ring's light as it passes.
    const fade =
      dawn.p >= CREST && ringT < 1
        ? Math.pow(1 - ringT, 1.6) * clamp(ringT / 0.06, 0, 1)
        : 0;
    root.style.setProperty(
      "--limb-catch",
      String(Math.round(fade * clamp(c.flare, 0, 1) * 1000) / 1000),
    );
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const setPhase = (p: number) => {
    const next = phaseOf(p);
    if (next === dawn.phase) return;
    dawn.phase = next;
    cfg?.onPhase(next);
  };

  const finish = () => {
    if (dawn.done) return;
    dawn.done = true;
    cfg?.onComplete();
  };

  /** The dawn's value from scrolling: from the frame's top entering the bottom of the view to its middle reaching 40% up. */
  const fromScroll = () => {
    const box = root.getBoundingClientRect();
    const sc = scrollParent(root);
    const top = sc ? sc.getBoundingClientRect().top : 0;
    const vh = sc ? sc.clientHeight : window.innerHeight;
    const y = box.top - top;
    const start = vh;
    const end = vh * 0.4 - box.height / 2;
    return clamp((start - y) / Math.max(1, start - end), 0, 1);
  };

  const target = (c: Config): number | null => {
    if (c.progress !== undefined) return clamp(c.progress, 0, 1);
    if (c.trigger === "manual") return 1;
    if (c.trigger === "scroll") return fromScroll();
    return null;
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (dawn.playing) {
      const now = performance.now();
      const t = (now - dawn.startAt) / Math.max(200, c.duration);
      if (t >= 0) dawn.p = clamp(dawn.from + (1 - dawn.from) * t, 0, 1);
      if (dawn.p >= 1) {
        dawn.p = 1;
        dawn.playing = false;
        setPhase(1);
        finish();
      } else {
        setPhase(dawn.p);
        moving = true;
      }
    }
    if (!c.paused && c.stars > 0) {
      sim.t += dt;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const k = springs.drift;
    for (let i = 0; i < steps; i += 1) {
      for (const s of [camX, camY]) {
        s.v +=
          ((k.stiffness * (s.target - s.x) - k.damping * s.v) / k.mass) * h;
        s.x += s.v * h;
      }
    }
    for (const s of [camX, camY]) {
      if (Math.abs(s.target - s.x) < 0.02 && Math.abs(s.v) < 0.2) {
        s.x = s.target;
        s.v = 0;
      } else moving = true;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const twinkling = c.motionSafe && !c.paused && c.stars > 0;
    const calm = !dawn.playing && camX.v === 0 && camY.v === 0;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = step(dt);
    draw();
    if (moving || twinkling) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const play = () => {
    const c = cfg;
    if (!c) return;
    if (!c.motionSafe) {
      dawn.p = 1;
      dawn.playing = false;
      setPhase(1);
      dawn.done = false;
      finish();
      return;
    }
    dawn.played = true;
    dawn.done = false;
    dawn.from = 0;
    dawn.p = 0;
    dawn.playing = true;
    dawn.startAt = performance.now() + Math.max(0, c.delay);
    setPhase(0);
    kick();
  };

  /** Puts the dawn where the host, the scroll or the trigger says it is now. */
  const settle = () => {
    const c = cfg;
    if (!c) return;
    const t = target(c);
    if (t !== null) {
      dawn.playing = false;
      dawn.p = t;
      setPhase(t);
      if (t >= 1) finish();
      else dawn.done = false;
    }
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
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
    if (c.trigger === "scroll") settle();
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

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        // Autoplayed dawns begin at night; a driven one starts where it is told.
        const t = target(next);
        dawn.p = t ?? (next.motionSafe ? 0 : 1);
        dawn.phase = phaseOf(dawn.p);
        dawn.done = dawn.p >= 1;
        if (!startGpu()) {
          // No WebGL2: the CSS still frame stays, and nothing retries.
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
        if (next.trigger === "mount" && next.progress === undefined) play();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (
        was.progress !== next.progress ||
        was.trigger !== next.trigger ||
        was.motionSafe !== next.motionSafe
      ) {
        if (target(next) !== null) settle();
        else if (!next.motionSafe) play();
      }
      if (!next.motionSafe) {
        camX.x = camX.target = 0;
        camY.x = camY.target = 0;
        camX.v = camY.v = 0;
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
    seen(inView) {
      const c = cfg;
      if (!c || !gpu) return;
      if (inView) {
        if (c.progress !== undefined || c.trigger === "manual") {
          draw();
          kick();
          return;
        }
        if (c.trigger === "scroll") {
          settle();
          draw();
          kick();
          return;
        }
        if (c.trigger === "inView" && (!dawn.played || !c.once)) play();
        draw();
        kick();
      } else if (c.trigger === "inView" && !c.once && dawn.played) {
        // Out of view, a repeating dawn goes back to night for its next pass.
        dawn.playing = false;
        dawn.played = false;
        dawn.p = c.motionSafe ? 0 : 1;
      }
    },
    scrolled() {
      const c = cfg;
      if (!c || c.trigger !== "scroll" || c.progress !== undefined) return;
      settle();
      draw();
    },
    hand(x, y) {
      const c = cfg;
      if (!c) return;
      if (x === null || !c.interactive || !c.motionSafe) {
        camX.target = 0;
        camY.target = 0;
      } else {
        camX.target = clamp(x, -1, 1) * 7;
        camY.target = clamp(y, -1, 1) * 4;
      }
      if (!c.motionSafe) {
        camX.x = camX.target;
        camY.x = camY.target;
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
 * A sunrise seen from orbit behind your headline: the curved edge of the
 * night side fills the lower frame under a hairline of atmosphere, and a
 * sun comes up from behind it. One progress value walks the dawn through
 * its beats — the airglow wakes into blue and thickens toward the sunrise
 * point, a white pinpoint crests the limb and flares into a brief ring of
 * light (a halo expanding on the enter curve while a flash runs both ways
 * along the limb), and the air warms into a thin amber band. Autoplayed on
 * mount or in view, tied to its scroll container, or driven by `progress`.
 *
 * One fullscreen WebGL2 pass at half the capped pixel ratio; the pointer
 * drifts the camera on the drift spring so stars, limb and sun part a few
 * pixels. The headline and eyebrow are real text from the first paint,
 * catching the ring's light as it passes. Under reduced motion the settled
 * final frame is drawn and nothing plays; without WebGL2 a CSS still of the
 * same frame stands in.
 */
export function LimbDawn({
  headline = "Waylight",
  eyebrow = "First light over the north",
  as = "h2",
  children,
  curvature = 0.5,
  atmosphere = 0.5,
  flare = 0.6,
  progress,
  trigger = "inView",
  duration = 4200,
  delay = 200,
  once = true,
  sunAt = 0.64,
  stars = 0.5,
  airColor = "var(--accent-bright)",
  dawnColor = "var(--warn)",
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onPhaseChange,
  onComplete,
  className,
}: LimbDawnProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      airOf(airColor),
      dawnOf(dawnColor),
      sunOf(dawnColor),
    ],
    [airColor, dawnColor],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const reportPhase = React.useRef(onPhaseChange);
  const reportDone = React.useRef(onComplete);

  const config: Config = {
    colorKey: paints.join("|"),
    curvature,
    atmosphere,
    flare,
    progress,
    trigger,
    duration,
    delay,
    once,
    sunAt,
    stars,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onPhase: (phase) => reportPhase.current?.(phase),
    onComplete: () => reportDone.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportPhase.current = onPhaseChange;
    reportDone.current = onComplete;
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
    // The observer may have spoken before the engine existed.
    if (visible.current) e.seen(true);
    // Scrolling drives a scroll-tied dawn; any scroll container will do.
    const onScroll = () => engine.current?.scrolled();
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
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
      { threshold: 0.25 },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const Heading = as;
  const still = standIn(curvature, sunAt, paints);

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const r = event.currentTarget.getBoundingClientRect();
        engine.current?.hand(
          ((event.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
          ((event.clientY - r.top) / Math.max(1, r.height)) * 2 - 1,
        );
      }}
      onPointerLeave={() => engine.current?.hand(null, 0)}
      className={cn(
        "group/limb-dawn relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-700 group-data-live/limb-dawn:opacity-0"
        style={still.space}
      >
        <div className="absolute" style={still.planet}>
          <div className="absolute rounded-full" style={still.sun} />
        </div>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full"
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
      <div className="@container absolute inset-x-0 top-0 bottom-[28%] flex flex-col items-center justify-center px-5 text-center">
        {eyebrow ? (
          <p className="font-mono text-[10px] tracking-[0.12em] text-ink-2 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <Heading
          className="mt-1.5 font-semibold tracking-tight text-balance text-foreground"
          style={{
            fontSize: "clamp(1.625rem, 7.5cqw, 3.75rem)",
            lineHeight: 1.05,
            textShadow: `0 0 calc(var(--limb-catch, 0) * 1.4em) color-mix(in oklab, ${dawnOf(dawnColor)} calc(var(--limb-catch, 0) * 90%), transparent)`,
          }}
        >
          {headline}
        </Heading>
        {children ? <div className="mt-3">{children}</div> : null}
      </div>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the settled dawn — the world as a circle whose
 * box-shadows are the amber band and the blue air, the sun just clear of
 * the limb with its glow. Every number is rounded so both renders match.
 */
function standIn(curvature: number, sunAt: number, paints: readonly string[]) {
  const k = radiusOf(curvature);
  // The circle is sized by the width; its crown sits at the apex height.
  const angle = Math.asin(
    clamp((clamp(sunAt, 0.05, 0.95) - 0.5) / k, -0.95, 0.95),
  );
  const sx = 50 + Math.sin(angle) * 50;
  const sy = 50 - Math.cos(angle) * 50;
  const air = paints[2] ?? "white";
  const dawn = paints[3] ?? "white";
  const sun = paints[4] ?? "white";
  return {
    space: {
      backgroundColor:
        "light-dark(color-mix(in oklab, var(--background) 96%, var(--foreground)), color-mix(in oklab, var(--background) 45%, black))",
    } as React.CSSProperties,
    planet: {
      left: `${pct(0.5 - k)}%`,
      width: `${pct(2 * k)}%`,
      top: `${APEX * 100}%`,
      aspectRatio: "1",
      borderRadius: "9999px",
      backgroundColor:
        "light-dark(color-mix(in oklab, var(--background) 90%, var(--foreground)), color-mix(in oklab, var(--background) 50%, black))",
      boxShadow: `0 -1px 0 0 ${dawn}, 0 -2px 6px 0 color-mix(in oklab, ${dawn} 60%, transparent), 0 -4px 22px 2px color-mix(in oklab, ${air} 45%, transparent)`,
    } as React.CSSProperties,
    sun: {
      left: `${pct(sx / 100)}%`,
      top: `${pct(sy / 100)}%`,
      width: 10,
      height: 10,
      transform: "translate(-50%, -110%)",
      background: `radial-gradient(circle, ${sun} 0 35%, color-mix(in oklab, ${dawn} 55%, transparent) 50%, transparent 72%)`,
      boxShadow: `0 0 18px 6px color-mix(in oklab, ${dawn} 35%, transparent)`,
    } as React.CSSProperties,
  };
}
