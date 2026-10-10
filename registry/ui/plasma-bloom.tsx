"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PlasmaBloomPalette = "linen" | "sage" | "denim" | "clay";

export type PlasmaBloomProps = {
  /** The content on top of the cloth: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** A named palette, or five CSS colours of your own in field order (the middle one shows most). @default "denim" */
  palette?: PlasmaBloomPalette | readonly string[];
  /** The plasma's wavelength, px. @default 280 */
  scale?: number;
  /** How fast the field evolves, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** How many sine fields interfere, 3 to 6. @default 4 */
  fields?: number;
  /** How the colours meet, 0 (a smooth gradient) to 1 (crisp printed bands). @default 0.45 */
  bands?: number;
  /** How far the field reaches into the palette's ends, 0 (mostly the middle colour) to 1. @default 0.7 */
  contrast?: number;
  /** A soft grain that makes it read as cloth, 0 to 1. @default 0.35 */
  grain?: number;
  /** The pointer and keyboard focus add interference rings, and a press drops a ring into the cloth. @default true */
  interactive?: boolean;
  /** How strong the hand's rings and a dropped ring are, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand's rings reach, px. @default 170 */
  radius?: number;
  /** Hold the field still; the hand still makes rings. @default false */
  paused?: boolean;
  /** Seeds the fields and their wandering centres, so two cloths never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) ringing the field. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Five pigments per palette, in field order: the middle colour covers most of
 * the cloth, the ends are where the field peaks. Low in chroma at fixed
 * lightness, so the cloth is the same cloth in either theme. Denim's deep
 * blue takes the accent token's hue.
 */
const PALETTES: Record<PlasmaBloomPalette, readonly string[]> = {
  linen: [
    "oklch(0.42 0.05 45)",
    "oklch(0.6 0.07 58)",
    "oklch(0.76 0.045 76)",
    "oklch(0.9 0.025 86)",
    "oklch(0.64 0.1 38)",
  ],
  sage: [
    "oklch(0.4 0.04 152)",
    "oklch(0.57 0.05 142)",
    "oklch(0.73 0.04 128)",
    "oklch(0.88 0.025 108)",
    "oklch(0.7 0.07 78)",
  ],
  denim: [
    "oklch(from var(--accent) 0.36 0.07 h)",
    "oklch(0.52 0.075 256)",
    "oklch(0.68 0.05 246)",
    "oklch(0.87 0.022 240)",
    "oklch(0.79 0.05 82)",
  ],
  clay: [
    "oklch(0.4 0.06 32)",
    "oklch(0.58 0.085 38)",
    "oklch(0.72 0.06 50)",
    "oklch(0.88 0.03 66)",
    "oklch(0.66 0.06 352)",
  ],
};

/** Each pigment sits 12% into the page, so the cloth belongs to its theme (oklab keeps the hue). */
const inPage = (c: string) =>
  `color-mix(in oklab, ${c} 88%, var(--background))`;

const RENDER_SCALE = 0.75;
const STEP = 1 / 120;
/** The hand's place follows on glide; its rings and a dropped ring's strength on drift. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** A dropped ring's front, px/s, and its kick into the drift spring. */
const RING_SPEED = 280;
const DROP_KICK = 26;
const DROPS = 3;
/** A composed moment for the still cloth. */
const STILL_TIME = 23;

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

/** Any CSS colour, as OKLab (L, a, b), by painting one pixel and converting. */
function labReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const r = lin(d[0] ?? 0);
    const g = lin(d[1] ?? 0);
    const b = lin(d[2] ?? 0);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    out[at] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    out[at + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    out[at + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  };
}

/** A focus this soon after a press or a lift inside came from the hand, ms. */
const PRESS_FOCUS_MS = 1000;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,video[controls],audio[controls],[role='button'],[role='link'],[role='slider'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='menuitem'],[role='option'],[role='combobox'],[role='spinbutton'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_scale;
uniform int u_fields;
uniform float u_bands;
uniform float u_contrast;
uniform float u_grain;
uniform vec3 u_lab[5];
uniform vec4 u_srcA[6];
uniform vec4 u_srcB[6];
uniform vec4 u_srcC[6];
uniform vec4 u_hand;
uniform vec4 u_drops[3];
uniform float u_ringPhase;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}
${GLSL_SRGB}

vec3 labToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

void main() {
  float W = u_res.x / u_px;
  float H = u_res.y / u_px;
  vec2 px = v_uv * vec2(W, H);
  vec2 p = px / u_scale;
  float t = u_time;

  // The plasma: planar and radial sines, summed and normalised.
  float v = 0.0;
  for (int k = 0; k < 6; k++) {
    if (k >= u_fields) break;
    vec4 A = u_srcA[k];
    vec4 B = u_srcB[k];
    vec4 C = u_srcC[k];
    if (B.y < 0.5) {
      v += sin(6.2831853 * dot(p, A.xy) * A.z + t * A.w + B.x);
    } else {
      // A radial source whose centre wanders on a slow Lissajous path.
      vec2 c = vec2(W, H) * (0.5 + C.xy * sin(t * B.zw + C.zw)) / u_scale;
      v += sin(6.2831853 * length(p - c) * A.z - t * A.w + B.x);
    }
  }
  v /= sqrt(float(u_fields) * 0.5);

  // The hand's rings: a local radial source, its phase travelling outward.
  vec2 toHand = px - u_hand.xy;
  float dh = length(toHand);
  float reach = exp(-dh * dh / (u_hand.w * u_hand.w));
  v += u_hand.z * reach * 1.4 * sin(6.2831853 * dh / max(u_scale * 0.24, 26.0) - u_ringPhase);

  // Dropped rings: packets riding outward from each press.
  for (int i = 0; i < 3; i++) {
    vec4 d = u_drops[i];
    if (d.w < 0.001) continue;
    float r = length(px - d.xy) - d.z;
    float width = u_scale * 0.5;
    v += d.w * 2.2 * exp(-r * r / (width * width)) * sin(6.2831853 * r / max(u_scale * 0.3, 30.0));
  }

  // Through the palette, mixed in OKLab, with a soft posterise.
  float x = clamp(0.5 + v * (0.16 + 0.26 * u_contrast), 0.0, 1.0) * 4.0;
  float i0 = min(floor(x), 3.0);
  float f = x - i0;
  float w = max(mix(0.5, 0.025, u_bands), fwidth(x) * 0.8);
  float stepped = smoothstep(0.5 - w, 0.5 + w, f);
  f = mix(f, stepped, clamp(u_bands * 2.2, 0.0, 1.0));
  vec3 a = u_lab[0];
  vec3 b = u_lab[1];
  if (i0 > 0.5) { a = u_lab[1]; b = u_lab[2]; }
  if (i0 > 1.5) { a = u_lab[2]; b = u_lab[3]; }
  if (i0 > 2.5) { a = u_lab[3]; b = u_lab[4]; }
  vec3 col = labToLinear(mix(a, b, f));

  col = kx_linearToSrgb(max(col, vec3(0.0)));
  // Grain fixed to the cloth: fine specks with a little clumping.
  vec2 g = floor(px);
  float grain = mix(kx_hash(g), kx_noise(px * 0.45), 0.35) - 0.5;
  col += grain * u_grain * 0.085;
  col += (kx_hash(gl_FragCoord.xy + 0.37) - 0.5) / 255.0;
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
  paletteKey: string;
  scale: number;
  speed: number;
  fields: number;
  bands: number;
  contrast: number;
  grain: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  drop: (x: number, y: number, strength: number) => void;
  dispose: () => void;
};

/** The sources, seeded: planar waves at spread angles, then radial ones. */
function laySources(seed: number) {
  const rand = lcg(seed * 19 + 11);
  const A = new Float32Array(24);
  const B = new Float32Array(24);
  const C = new Float32Array(24);
  const turn = rand() * Math.PI;
  // Planar, radial, radial, planar, radial, planar: any count from 3 holds at
  // least two wandering centres and at least one planar wave.
  for (let k = 0; k < 6; k += 1) {
    const radial = k === 1 || k === 2 || k === 4;
    const angle = turn + (k / 6) * Math.PI * 1.9 + rand() * 0.4;
    A[k * 4] = Math.cos(angle);
    A[k * 4 + 1] = Math.sin(angle);
    A[k * 4 + 2] = 0.7 + rand() * 0.6;
    A[k * 4 + 3] = (0.35 + rand() * 0.45) * (rand() < 0.5 ? -1 : 1);
    B[k * 4] = rand() * Math.PI * 2;
    B[k * 4 + 1] = radial ? 1 : 0;
    B[k * 4 + 2] = 0.05 + rand() * 0.07;
    B[k * 4 + 3] = 0.04 + rand() * 0.07;
    C[k * 4] = 0.25 + rand() * 0.3;
    C[k * 4 + 1] = 0.25 + rand() * 0.3;
    C[k * 4 + 2] = rand() * Math.PI * 2;
    C[k * 4 + 3] = rand() * Math.PI * 2;
  }
  return { A, B, C };
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
  let active = false;
  let sources = laySources(1);
  const read = labReader();
  const lab = new Float32Array(15);
  const drops = new Float32Array(DROPS * 4);
  /** Each drop's spring velocity and whether it travels. */
  const dropV = new Float32Array(DROPS);
  const dropCharge = new Float32Array(DROPS);
  let nextDrop = 0;
  const size = { w: 0, h: 0 };
  const sim = { t: STILL_TIME, ring: 0 };
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
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

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    p.program.set({
      u_res: [canvas.width, canvas.height],
      u_px: canvas.width / Math.max(1, size.w),
      u_scale: clamp(c.scale, 60, 1200),
      u_fields: clamp(Math.round(c.fields), 3, 6),
      u_bands: clamp(c.bands, 0, 1),
      u_contrast: clamp(c.contrast, 0, 1),
      u_grain: clamp(c.grain, 0, 1),
      u_lab: lab,
      u_srcA: sources.A,
      u_srcB: sources.B,
      u_srcC: sources.C,
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_time ?? null, c.motionSafe ? sim.t : STILL_TIME);
    gl.uniform1f(u.u_ringPhase ?? null, c.motionSafe ? sim.ring : 0);
    gl.uniform4f(
      u.u_hand ?? null,
      hand.px,
      hand.py,
      hand.amount,
      clamp(c.radius, 40, 800),
    );
    gl.uniform4fv(u.u_drops ?? null, drops);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the field, the hand and the drops. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    if (hand.amount > 0.001 || want > 0) {
      sim.ring += dt * 1.8;
      moving = true;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (want - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount += hand.amountV * h;
      for (let i = 0; i < DROPS; i += 1) {
        const at = i * 4 + 3;
        const a = drops[at] ?? 0;
        const v = dropV[i] ?? 0;
        const charge = dropCharge[i] ?? 0;
        const nv =
          v +
          ((DRIFT.stiffness * (charge - a) - DRIFT.damping * v) / DRIFT.mass) *
            h;
        dropV[i] = nv;
        drops[at] = a + nv * h;
      }
    }
    // A dropped ring's charge leaks away while its front keeps travelling.
    const leak = Math.exp(-dt / 0.45);
    for (let i = 0; i < DROPS; i += 1) {
      const at = i * 4;
      const a = drops[at + 3] ?? 0;
      dropCharge[i] = (dropCharge[i] ?? 0) * leak;
      if (a > 0.001 || Math.abs(dropV[i] ?? 0) > 0.01) {
        drops[at + 2] = (drops[at + 2] ?? 0) + RING_SPEED * dt;
        moving = true;
      } else {
        drops[at + 3] = 0;
        dropV[i] = 0;
        dropCharge[i] = 0;
      }
    }
    const handMoving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!handMoving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    return moving || handMoving || arriving;
  };

  /** Reduced motion: a dropped ring stands still and fades. */
  const fadeStill = (dt: number): boolean => {
    let fading = false;
    for (let i = 0; i < DROPS; i += 1) {
      const at = i * 4 + 3;
      const a = Math.max(0, (drops[at] ?? 0) - dt / durations.page);
      drops[at] = a;
      if (a > 0) fading = true;
    }
    return fading;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (
      disposed ||
      !visible.current ||
      document.hidden ||
      !c ||
      !gpu ||
      gpu.lost
    ) {
      last = 0;
      return;
    }
    // Evolving alone, the cloth moves slowly enough for twenty-four frames
    // a second; the hand and a dropped ring get every frame.
    let busy = hand.present || hand.amount > 0;
    for (let i = 0; i < DROPS; i += 1) {
      if ((drops[i * 4 + 3] ?? 0) > 0) busy = true;
    }
    if (!busy && last && now - drawnAt < 41) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : fadeStill(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (
      disposed ||
      frame ||
      !visible.current ||
      document.hidden ||
      !gpu ||
      gpu.lost
    )
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, lab, i * 3);
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
      if (!was || was.seed !== next.seed) sources = laySources(next.seed);
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS still cloth stays, and nothing retries.
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
      if (was.dpr !== next.dpr) resize();
      if (was.paletteKey !== next.paletteKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        hand.px = hand.x;
        hand.py = hand.y;
        hand.amount =
          hand.present && next.interactive
            ? clamp(next.pointerStrength, 0, 1)
            : 0;
        dropV.fill(0);
        dropCharge.fill(0);
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
    handTo(x, y, source) {
      const c = cfg;
      // A still stand-in has no hand to report.
      if (!c?.interactive || failed || !gpu || gpu.lost) return;
      if (!hand.present || hand.amount < 0.01) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe) {
        // Reduced motion: the rings stand where the hand is.
        hand.px = x;
        hand.py = y;
        hand.amount = clamp(c.pointerStrength, 0, 1);
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) hand.amount = 0;
      kick();
    },
    drop(x, y, strength) {
      const c = cfg;
      if (!c?.interactive || !gpu) return;
      const power = clamp(c.pointerStrength, 0, 1) * strength;
      const i = nextDrop;
      nextDrop = (nextDrop + 1) % DROPS;
      const at = i * 4;
      drops[at] = x;
      drops[at + 1] = y;
      if (c.motionSafe) {
        // The ring rises fast and dies slowly, on a spring that never wobbles.
        drops[at + 2] = 0;
        drops[at + 3] = 0;
        dropV[i] = DROP_KICK * power;
        dropCharge[i] = 0.45 * power;
      } else {
        drops[at + 2] = clamp(c.radius, 40, 800) * 0.6;
        drops[at + 3] = 0.55 * power;
        dropV[i] = 0;
        dropCharge[i] = 0;
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

/**
 * A background of plasma in a palette you would wear, with the content on top
 * in its own layer. Interfering sine fields — planar waves at seeded angles
 * and radial ones whose centres wander on slow Lissajous paths — are summed
 * and mapped through five low-chroma pigments, mixed in OKLab so no blend goes
 * grey, with a soft posterise that runs from a smooth gradient to crisp
 * printed bands, and a fine grain fixed to the cloth. It evolves slowly.
 *
 * The pointer adds its own radial source: rings around the hand whose phase
 * travels outward and interferes with the field into a soft moiré, the place
 * following on glide and the strength arriving on drift. A press drops a ring
 * into the cloth — a wave packet that rides outward at 280 px/s while its
 * strength, kicked into a critically damped spring with the drift constants,
 * rises fast and dies away — and the contours ripple as it passes. Keyboard
 * focus on a control inside brings the rings there and drops a softer one.
 * Twenty-four frames a second while it only evolves, every frame while the
 * hand works; nothing off screen or in a hidden page. Without WebGL2 a CSS
 * still cloth stands in; under reduced motion one still frame is drawn, the
 * rings stand where the hand is, and a dropped ring stays put and fades.
 */
export function PlasmaBloom({
  children,
  palette = "denim",
  scale = 280,
  speed = 0.5,
  fields = 4,
  bands = 0.45,
  contrast = 0.7,
  grain = 0.35,
  interactive = true,
  pointerStrength = 0.6,
  radius = 170,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: PlasmaBloomProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette] ?? PALETTES.denim)
        : palette.length >= 5
          ? palette.slice(0, 5)
          : PALETTES.denim;
    return list.map(inPage);
  }, [palette]);
  const paletteKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    paletteKey,
    scale,
    speed,
    fields,
    bands,
    contrast,
    grain,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
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
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  /** When the hand last pressed or lifted inside, so the focus it causes is not taken for the keyboard. */
  const pressedAt = React.useRef(-Infinity);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedAt.current = performance.now();
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit))
      engine.current?.drop(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    // A tap focuses its target after the finger lifts.
    pressedAt.current = performance.now();
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    // A text field shows a focus ring even when clicked; a press is not the keyboard.
    if (performance.now() - pressedAt.current < PRESS_FOCUS_MS) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.drop(at.x, at.y, 0.55);
  };

  // A key pressed inside means the next focus is the keyboard's, however
  // recently the hand pressed.
  const onKeyDown = () => {
    pressedAt.current = -Infinity;
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDownCapture={onKeyDown}
      className={cn(
        // Nothing is dragged here; the page keeps its vertical scroll on touch.
        "group/plasma-bloom relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/plasma-bloom:opacity-0"
        style={standIn(paints, seed)}
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
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: banded rings of the palette round a seeded centre,
 * softened by blots of its ends.
 */
function standIn(paints: readonly string[], seed: number): React.CSSProperties {
  const rand = lcg(seed * 7 + 3);
  const at = () =>
    `${Math.round(15 + rand() * 70)}% ${Math.round(15 + rand() * 70)}%`;
  const [c0, c1, c2, c3, c4] = paints;
  return {
    backgroundColor: c2,
    backgroundImage: [
      `radial-gradient(ellipse 45% 70% at ${at()}, ${c4} 0, transparent 70%)`,
      `radial-gradient(ellipse 50% 80% at ${at()}, ${c0} 0, transparent 70%)`,
      `repeating-radial-gradient(circle at ${at()}, ${c1} 0 36px, ${c2} 44px 80px, ${c3} 88px 124px, ${c2} 132px 168px)`,
    ].join(", "),
  };
}
