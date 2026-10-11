"use client";

import * as React from "react";

import { animate } from "motion/react";

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
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GelCue = {
  /** What the gel is called, for the cue's accessible name. */
  name: string;
  /** The gel's colour, any CSS colour. */
  color: string;
};

export type GelScrollerPreset = "spectrum" | "dusk" | "neon" | "theatre";

export type GelScrollerProps = {
  /** The gels on every strip, in order: a preset or your own list (2 to 12). @default "spectrum" */
  cues?: GelScrollerPreset | GelCue[];
  /** How much haze hangs in the air: more shows the beams and blurs them into one another, 0 to 1. @default 0.55 */
  haze?: number;
  /** The scroller motor's top speed, in gel frames a second. @default 4 */
  roll?: number;
  /** Controlled: the cue every strip holds, or null to let them roll. */
  value?: number | null;
  /** The cue held at first, when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the click, tap or key that took (or let go of) a cue. */
  onValueChange?: (value: number | null) => void;
  /** How many lamps stand along the floor, 3 to 9. @default 6 */
  beams?: number;
  /** How wide each wash spreads, 0 to 1. @default 0.5 */
  spread?: number;
  /** How bright the lamps burn, 0 to 1.5. @default 1 */
  intensity?: number;
  /** How fast the strips roll on their own while no cue is held, frames a second; 0 holds them. @default 0.35 */
  chase?: number;
  /** A stage floor with pools of light under the lamps. @default true */
  floor?: boolean;
  /** The cyclorama behind the beams, any CSS colour. @default a dark stage pigment */
  backdrop?: string;
  /** Hovering previews a cue and a click takes it. @default true */
  interactive?: boolean;
  /** Freezes the haze and the strips. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The cue rail's accessible name. @default "Lighting cue" */
  label?: string;
  /** The rail cannot be used; the strips still roll. @default false */
  disabled?: boolean;
  /** Sizes the stage. @default "h-56 w-full" */
  className?: string;
};

/** A stage gel: a token's hue at a fixed lightness and chroma, the same on any page. */
const gel = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} ${turn ? `calc(h + ${turn})` : "h"})`;

const PRESETS: Record<GelScrollerPreset, GelCue[]> = {
  spectrum: [
    { name: "Deep blue", color: gel("--accent", 0.52, 0.22) },
    { name: "Lavender", color: gel("--accent", 0.72, 0.14, 40) },
    { name: "Magenta", color: gel("--accent", 0.62, 0.24, 70) },
    { name: "Red", color: gel("--danger", 0.6, 0.22) },
    { name: "Amber", color: gel("--warn", 0.78, 0.17, -14) },
    { name: "Straw", color: gel("--warn", 0.9, 0.1, 8) },
    { name: "Green", color: gel("--success", 0.72, 0.18) },
    { name: "Cyan", color: gel("--signal", 0.78, 0.13, 36) },
  ],
  dusk: [
    { name: "Amber", color: gel("--warn", 0.76, 0.16, -18) },
    { name: "Rose", color: gel("--danger", 0.72, 0.13, 6) },
    { name: "Lavender", color: gel("--accent", 0.7, 0.13, 40) },
    { name: "Deep blue", color: gel("--accent", 0.48, 0.2) },
    { name: "Peach", color: gel("--warn", 0.84, 0.1, -30) },
  ],
  neon: [
    { name: "Magenta", color: gel("--accent", 0.64, 0.26, 72) },
    { name: "Cyan", color: gel("--signal", 0.8, 0.14, 36) },
    { name: "Lime", color: gel("--success", 0.86, 0.2, -30) },
    { name: "Violet", color: gel("--accent", 0.56, 0.24, 26) },
    { name: "Hot red", color: gel("--danger", 0.62, 0.24) },
  ],
  theatre: [
    { name: "Open white", color: gel("--warn", 0.96, 0.02) },
    { name: "Bastard amber", color: gel("--warn", 0.86, 0.09, -24) },
    { name: "Steel blue", color: gel("--accent", 0.74, 0.08) },
    { name: "Pale rose", color: gel("--danger", 0.84, 0.07) },
  ],
};

const MAX_BEAMS = 9;
const MAX_CUES = 12;
/** How much of the strip runs up a beam, in frames: the seam's journey. */
const RUN = 0.45;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pct3 = (v: number) => `${Number((v * 100).toFixed(3))}%`;
const mod = (a: number, n: number) => ((a % n) + n) % n;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform int u_count;
uniform float u_offset[${MAX_BEAMS}];
uniform float u_prev[${MAX_BEAMS}];
uniform float u_fade;
uniform vec3 u_cues[${MAX_CUES}];
uniform int u_cueCount;
uniform float u_haze;
uniform float u_spread;
uniform float u_intensity;
uniform float u_time;
uniform float u_floor;
uniform vec3 u_backdrop;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

// The strip at a position, in frames: each frame its gel, a soft blend into
// the next over the last few percent, and the dark line of tape between.
vec3 strip(float u) {
  float n = float(u_cueCount);
  float f = floor(u);
  float fr = u - f;
  int a = int(mod(f, n));
  int b = int(mod(f + 1.0, n));
  vec3 c = mix(u_cues[a], u_cues[b], smoothstep(0.94, 1.0, fr));
  float seam = min(fr, 1.0 - fr) / 0.014;
  return c * (1.0 - 0.6 * exp(-seam * seam));
}

void main() {
  vec2 p = v_uv * u_res;
  float W = u_res.x;
  float H = u_res.y;
  float floorH = H * 0.15 * u_floor;
  float lampY = H - floorH;
  float n = float(u_count);
  float pitch = W / n;
  // Haze drifts up and sideways; the beams light what hangs in them.
  float hz = kx_fbm(vec2(p.x / W * 3.2 + u_time * 0.035, p.y / H * 2.1 - u_time * 0.06));
  float hz2 = kx_fbm(vec2(p.x / W * 7.0 - u_time * 0.02, p.y / H * 5.0 - u_time * 0.1) + 11.0);
  float air = mix(1.0, 0.35 + 1.25 * hz * (0.7 + 0.6 * hz2), u_haze);

  vec3 light = vec3(0.0);
  vec3 scatter = vec3(0.0);
  vec3 pools = vec3(0.0);
  float h = clamp((lampY - p.y) / max(lampY, 1.0), 0.0, 1.0);
  for (int i = 0; i < ${MAX_BEAMS}; i += 1) {
    if (i >= u_count) break;
    float x = (float(i) + 0.5) * pitch;
    float dx = p.x - x;
    vec3 now = strip(u_offset[i] - h * ${RUN.toFixed(2)});
    vec3 was = strip(u_prev[i] - h * ${RUN.toFixed(2)});
    vec3 col = mix(was, now, u_fade);
    float w = pitch * (0.08 + 0.3 * u_spread) * (0.4 + 1.1 * h) * (1.0 + u_haze * 0.3);
    float across = exp(-dx * dx / (w * w));
    float along = (0.25 + 0.75 * (1.0 - h) * (1.0 - h)) * smoothstep(0.0, 0.03, h);
    float core = exp(-dx * dx / (w * w * 0.1)) * exp(-h * 7.0) * 0.9;
    light += col * (across * along * air + core) * step(p.y, lampY);
    float wide = pitch * (0.7 + 1.2 * u_haze);
    scatter += col * exp(-dx * dx / (wide * wide)) * (0.25 + 0.75 * (1.0 - h) * (1.0 - h));
    // The floor: a pool round each lamp and a faint reflection of its beam.
    float fy = (p.y - lampY) / max(floorH, 1.0);
    float pool = exp(-dx * dx / (pitch * pitch * 0.12)) * exp(-fy * fy * 2.5);
    vec3 under = strip(u_offset[i]);
    pools += mix(strip(u_prev[i]), under, u_fade) * pool;
  }
  vec3 stage = u_backdrop;
  vec3 col = stage + light * 0.8 * u_intensity + scatter * (0.015 + 0.06 * u_haze) * u_intensity;
  if (p.y > lampY) {
    vec3 boards = u_backdrop * 0.72;
    col = boards + pools * 0.55 * u_intensity + scatter * 0.04 * u_intensity;
  }
  // Light piles up toward white the way it does on a real cyc.
  col = 1.0 - exp(-col * 1.1);
  o_color = vec4(col, 1.0);
}
`;

type Vec3 = [number, number, number];

type Config = {
  beams: number;
  haze: number;
  roll: number;
  spread: number;
  intensity: number;
  chase: number;
  floor: boolean;
  dpr: number;
  motionSafe: boolean;
  paused: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  colours: (cues: Vec3[], backdrop: Vec3) => void;
  hold: (cue: number | null) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

/** Any CSS colour as 0–1 rgb, through a 1×1 canvas. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Vec3 => {
    if (!ctx) return [0.5, 0.5, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/** Where each strip starts: a little behind the one before, a chase. */
const startOffset = (i: number) => 0.5 + i * 0.32;

function createStage(
  root: HTMLDivElement,
  glCanvas: HTMLCanvasElement,
  lamps: () => [number, HTMLElement][],
  onLive: () => void,
  onFallback: (on: boolean) => void,
): Engine {
  let cfg: Config | null = null;
  let cues: Vec3[] = [];
  let backdrop: Vec3 = [0.1, 0.1, 0.12];
  let gpu: Gpu | null = null;
  let width = 0;
  let height = 0;
  let visible = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let painted = false;
  let fallback = false;
  let held: number | null = null;
  let time = 0;
  let fade = 1;
  let fadeRun: { stop: () => void } | null = null;
  const offset = new Float32Array(MAX_BEAMS);
  const prev = new Float32Array(MAX_BEAMS);
  const vel = new Float32Array(MAX_BEAMS);
  const target = new Float32Array(MAX_BEAMS);
  const flat = new Float32Array(MAX_CUES * 3);
  for (let i = 0; i < MAX_BEAMS; i += 1) {
    offset[i] = startOffset(i);
    prev[i] = offset[i] ?? 0;
    target[i] = offset[i] ?? 0;
  }

  const setFallback = (on: boolean) => {
    if (on === fallback) return;
    fallback = on;
    onFallback(on);
  };

  const buildGpu = (): boolean => {
    const gl = createGL(glCanvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    gpu = {
      gl,
      program,
      tri: createFullscreenTriangle(gl, program),
      lost: false,
    };
    return true;
  };
  if (!buildGpu()) setFallback(true);

  const detachLoss = onContextLoss(
    glCanvas,
    () => {
      if (gpu) gpu.lost = true;
      setFallback(true);
    },
    () => {
      gpu = null;
      if (buildGpu()) setFallback(false);
      request();
    },
  );

  /** The colour at a strip position, for the lamps' lenses and the CSS washes. */
  const colourAt = (u: number): Vec3 => {
    const n = Math.max(1, cues.length);
    const f = Math.floor(u);
    const fr = u - f;
    const a = cues[mod(f, n)] ?? [1, 1, 1];
    const b = cues[mod(f + 1, n)] ?? a;
    const t = clamp((fr - 0.94) / 0.06, 0, 1);
    const k = t * t * (3 - 2 * t);
    return [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];
  };

  const aimAt = (cue: number) => {
    const n = Math.max(1, cues.length);
    const centre = cue + 0.5;
    for (let i = 0; i < MAX_BEAMS; i += 1) {
      const o = offset[i] ?? 0;
      let d = mod(centre - o, n);
      // The shortest way round the strip, as a real scroller would roll.
      if (d > n / 2) d -= n;
      target[i] = o + d;
    }
  };

  const moving = () => {
    if (!cfg) return false;
    if (
      cfg.motionSafe &&
      !cfg.paused &&
      (held === null ? cfg.chase > 0 : false)
    )
      return true;
    for (let i = 0; i < cfg.beams; i += 1) {
      if (
        Math.abs((target[i] ?? 0) - (offset[i] ?? 0)) > 0.0005 ||
        Math.abs(vel[i] ?? 0) > 0.001
      ) {
        return true;
      }
    }
    return fadeRun !== null || (cfg.motionSafe && !cfg.paused && cfg.haze > 0);
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c || c.paused) return;
    if (c.motionSafe) time += dt;
    const top = Math.max(0.25, c.roll);
    for (let i = 0; i < c.beams; i += 1) {
      if (held === null && c.motionSafe) {
        // Rolling free: every strip runs on at the chase speed.
        target[i] = (target[i] ?? 0) + c.chase * dt;
      }
      if (!c.motionSafe) {
        offset[i] = target[i] ?? 0;
        vel[i] = 0;
        continue;
      }
      // The snap spring drives the motor, capped at its top speed: a long
      // roll runs at speed through the gels between and brakes with one
      // crisp overshoot onto its frame.
      const k = springs.snap.stiffness;
      const d = springs.snap.damping;
      let v =
        (vel[i] ?? 0) +
        (((target[i] ?? 0) - (offset[i] ?? 0)) * k - (vel[i] ?? 0) * d) * dt;
      v = clamp(v, -top, top);
      vel[i] = v;
      offset[i] = (offset[i] ?? 0) + v * dt;
      if (
        held !== null &&
        Math.abs((target[i] ?? 0) - (offset[i] ?? 0)) < 0.0005 &&
        Math.abs(v) < 0.002
      ) {
        offset[i] = target[i] ?? 0;
        vel[i] = 0;
      }
    }
  };

  const paintLamps = () => {
    // Lamps are keyed by beam (the CSS washes by 100 + beam).
    for (const [key, el] of lamps()) {
      const col = colourAt(offset[key % 100] ?? 0);
      const css = `rgb(${Math.round(col[0] * 255)}, ${Math.round(col[1] * 255)}, ${Math.round(col[2] * 255)})`;
      el.style.setProperty("--lens", css);
    }
  };

  const draw = (now: number) => {
    frame = 0;
    if (disposed || !visible || !cfg || cues.length === 0 || width < 2) return;
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    step(dt);
    paintLamps();
    const g = gpu;
    if (g && !g.lost && !g.gl.isContextLost() && !fallback) {
      const { gl } = g;
      // Everything here is soft: half resolution costs nothing you can see.
      resizeGL(gl, glCanvas, {
        dprCap: clamp(cfg.dpr, 0.5, 2),
        renderScale: 0.5,
      });
      flat.fill(0);
      cues.slice(0, MAX_CUES).forEach((c, i) => flat.set(c, i * 3));
      g.program.use();
      g.program.set({
        u_res: [width, height],
        u_count: cfg.beams,
        u_offset: offset,
        u_prev: prev,
        u_fade: fade,
        u_cues: flat,
        u_cueCount: Math.min(MAX_CUES, cues.length),
        u_haze: clamp(cfg.haze, 0, 1),
        u_spread: clamp(cfg.spread, 0, 1),
        u_intensity: clamp(cfg.intensity, 0, 1.5),
        u_time: time,
        u_floor: cfg.floor ? 1 : 0,
        u_backdrop: backdrop,
      });
      g.tri.draw();
      if (!painted) {
        painted = true;
        onLive();
      }
    }
    if (moving()) frame = requestAnimationFrame(draw);
    else last = 0;
  };

  const request = () => {
    if (frame || disposed || !visible) return;
    frame = requestAnimationFrame(draw);
  };

  return {
    configure: (next) => {
      cfg = { ...next, beams: clamp(Math.round(next.beams), 3, MAX_BEAMS) };
      request();
    },
    colours: (list, back) => {
      cues = list;
      backdrop = back;
      if (held !== null) aimAt(held);
      request();
    },
    hold: (cue) => {
      const c = cfg;
      held = cue;
      if (cue !== null) aimAt(cue);
      else for (let i = 0; i < MAX_BEAMS; i += 1) target[i] = offset[i] ?? 0;
      if (c && !c.motionSafe) {
        // No roll: the washes cross-fade from the old gels to the new.
        prev.set(offset);
        for (let i = 0; i < MAX_BEAMS; i += 1) offset[i] = target[i] ?? 0;
        fadeRun?.stop();
        fade = 0;
        fadeRun = animate(0, 1, {
          duration: durations.base,
          ease: easings.move,
          onUpdate: (v) => {
            fade = v;
            request();
          },
          onComplete: () => {
            fadeRun = null;
            request();
          },
        });
      }
      request();
    },
    resize: () => {
      width = Math.max(1, root.clientWidth);
      height = Math.max(1, root.clientHeight);
      request();
    },
    setVisible: (on) => {
      visible = on;
      if (on) request();
    },
    dispose: () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      fadeRun?.stop();
      fadeRun = null;
      detachLoss();
      const g = gpu;
      gpu = null;
      if (g && !g.lost && !g.gl.isContextLost()) {
        g.tri.dispose();
        g.program.dispose();
      }
    },
  };
}

/**
 * A stage seen from the house: floor lamps throw soft washes up a cyc
 * through haze, each lamp behind a gel scroller — a strip of gels taped end to
 * end that a motor rolls past the lens. A beam's colour at each height is the
 * frame that was at the lens a moment before, so as a strip rolls the seam
 * travels up the beam, and with nothing held the strips chase through the
 * spectrum. Hover previews the cue under the pointer and a click takes it:
 * every strip rolls the shortest way round on a spring with the
 * `springs.snap` constants, capped at the motor's speed (`roll`), and brakes
 * onto the frame together. The cue rail is a radiogroup; Escape lets the
 * strips roll free. Under reduced motion nothing chases and a cue cross-fades
 * in without rolling through the gels between.
 */
export function GelScroller({
  cues = "spectrum",
  haze = 0.55,
  roll = 4,
  value,
  defaultValue = null,
  onValueChange,
  beams = 6,
  spread = 0.5,
  intensity = 1,
  chase = 0.35,
  floor = true,
  backdrop = "oklch(0.17 0.02 258)",
  interactive = true,
  paused = false,
  dpr = 2,
  label = "Lighting cue",
  disabled = false,
  className,
}: GelScrollerProps) {
  const motionSafe = useMotionSafe();
  const list =
    (typeof cues === "string" ? PRESETS[cues] : cues) ?? PRESETS.spectrum;
  const gels = (list.length >= 2 ? list : PRESETS.spectrum).slice(0, MAX_CUES);
  const count = clamp(Math.round(beams), 3, MAX_BEAMS);
  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const current = value === undefined ? own : value;
  const heldCue =
    current !== null && current >= 0 && current < gels.length ? current : null;
  const [preview, setPreview] = React.useState<number | null>(null);
  const [focusCue, setFocusCue] = React.useState<number | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [live, setLive] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);
  const active = interactive && !disabled;
  const shown = preview ?? heldCue;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriers = React.useRef<HTMLSpanElement | null>(null);
  const lampRefs = React.useRef(new Map<number, HTMLElement>());
  const radios = React.useRef(new Map<number, HTMLButtonElement>());
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const pageShown = React.useRef(true);

  const cfg: Config = {
    beams: count,
    haze,
    roll,
    spread,
    intensity,
    chase,
    floor,
    dpr,
    motionSafe,
    paused,
  };
  const cfgRef = React.useRef(cfg);
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
  });

  const readColours = React.useCallback(() => {
    const host = carriers.current;
    if (!host) return;
    const read = colourReader();
    const kids = Array.from(host.children);
    const all = kids.map((el) => read(getComputedStyle(el).color));
    const back = all.pop() ?? [0.1, 0.1, 0.12];
    engine.current?.colours(all, back);
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = glRef.current;
    if (!root || !canvas) return;
    const e = createStage(
      root,
      canvas,
      () => [...lampRefs.current.entries()],
      () => setLive(true),
      (on) => setFallback(on),
    );
    engine.current = e;
    e.configure(cfgRef.current);
    readColours();
    e.resize();
    e.setVisible(visible.current && pageShown.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [readColours]);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  const colourKey = `${gels.map((g) => g.color).join("|")}|${backdrop}`;
  React.useEffect(() => {
    readColours();
  }, [colourKey, readColours]);

  React.useEffect(() => {
    engine.current?.hold(shown);
  }, [shown, colourKey]);

  React.useEffect(() => {
    const onVisibility = () => {
      pageShown.current = document.visibilityState !== "hidden";
      engine.current?.setVisible(visible.current && pageShown.current);
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
      engine.current?.setVisible(visible.current && pageShown.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const take = (cue: number | null) => {
    if (!active) return;
    const next = cue !== null && cue === heldCue ? null : cue;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    const g = next === null ? null : gels[next];
    setSaid((s) => ({
      n: s.n + 1,
      text:
        g && next !== null
          ? `Cue ${next + 1}, ${g.name}, held.`
          : "Rolling free.",
    }));
  };

  const zoneOf = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    const r = root.getBoundingClientRect();
    return clamp(
      Math.floor(((clientX - r.left) / Math.max(1, r.width)) * gels.length),
      0,
      gels.length - 1,
    );
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || !motionSafe) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const zone = zoneOf(event.clientX);
    if (zone !== preview) setPreview(zone);
  };

  const onKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const n = gels.length;
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + n) % n;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    else if (event.key === "Escape") {
      // The stage closes on an Escape left unhandled; this one is ours.
      event.preventDefault();
      if (heldCue !== null) take(heldCue);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    setFocusCue(next);
    radios.current.get(next)?.focus();
    if (next !== heldCue) take(next);
  };

  const tabCue = focusCue ?? heldCue ?? 0;
  // The server's frame: each lamp in the gel its strip starts on.
  const startCue = (i: number) => Math.floor(startOffset(i)) % gels.length;

  return (
    <div
      ref={bindRoot}
      data-live={live && !fallback ? "" : undefined}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerMove}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") setPreview(null);
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") setPreview(null);
      }}
      onClick={(event) => {
        if (!active) return;
        if ((event.target as HTMLElement).closest("[role='radio']")) return;
        take(zoneOf(event.clientX));
      }}
      className={cn(
        "group/gel-scroller relative isolate h-56 w-full touch-pan-y overflow-clip select-none",
        active ? "cursor-pointer" : "",
        className,
      )}
      style={{ backgroundColor: backdrop }}
    >
      {/* The washes as the server draws them, and without WebGL. */}
      <div
        aria-hidden
        className="absolute inset-0 group-data-live/gel-scroller:hidden"
      >
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              if (el) lampRefs.current.set(100 + i, el);
              else lampRefs.current.delete(100 + i);
            }}
            className="absolute bottom-[15%] h-[85%] -translate-x-1/2 blur-md"
            style={{
              left: pct3((i + 0.5) / count),
              width: pct3((0.5 + spread * 0.7) / count),
              backgroundImage: `radial-gradient(ellipse 50% 100% at 50% 100%, color-mix(in oklab, var(--lens, ${gels[startCue(i)]?.color ?? "white"}) 85%, transparent) 0%, transparent 100%)`,
              opacity:
                Math.round(clamp(0.45 + intensity * 0.4, 0, 1) * 100) / 100,
            }}
          />
        ))}
      </div>
      <canvas
        ref={glRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/gel-scroller:opacity-100"
      />
      {floor ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-[15%] h-px bg-white/10"
        />
      ) : null}
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          aria-hidden
          ref={(el) => {
            if (el) lampRefs.current.set(i, el);
            else lampRefs.current.delete(i);
          }}
          className={cn(
            "pointer-events-none absolute flex h-3.5 w-7 -translate-x-1/2 translate-y-1/2 items-start justify-center rounded-[3px] border border-white/10",
            floor ? "bottom-[15%]" : "bottom-2",
          )}
          style={{
            left: pct3((i + 0.5) / count),
            backgroundColor: "oklch(0.24 0.012 258)",
          }}
        >
          <span
            className="-mt-px h-1 w-5 rounded-full"
            style={{
              backgroundColor: `var(--lens, ${gels[startCue(i)]?.color ?? "white"})`,
              boxShadow: `0 -2px 8px var(--lens, ${gels[startCue(i)]?.color ?? "white"})`,
            }}
          />
        </span>
      ))}
      <div
        role="radiogroup"
        aria-label={label}
        className="absolute inset-x-3 top-2 z-10 flex gap-1"
      >
        {gels.map((g, i) => {
          const checked = heldCue === i;
          const lit = shown === i;
          return (
            <button
              key={`${i}-${g.name}`}
              ref={(el) => {
                if (el) radios.current.set(i, el);
                else radios.current.delete(i);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`Cue ${i + 1}, ${g.name}`}
              tabIndex={active && tabCue === i ? 0 : -1}
              disabled={!active}
              onClick={(event) => {
                event.stopPropagation();
                take(i);
              }}
              onFocus={() => setFocusCue(i)}
              onKeyDown={(event) => onKey(event, i)}
              className={cn(
                "relative flex h-6 min-w-0 flex-1 items-start rounded-1 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                "disabled:cursor-default",
              )}
            >
              <span
                className={cn(
                  "mt-1.5 block w-full rounded-full transition-[height,opacity] duration-150",
                  lit ? "h-1.5 opacity-100" : "h-1 opacity-55",
                )}
                style={{ backgroundColor: g.color }}
              />
              {checked ? (
                <span className="absolute top-4 left-1/2 size-1 -translate-x-1/2 rounded-full bg-white/85" />
              ) : null}
            </button>
          );
        })}
      </div>
      <span
        ref={carriers}
        aria-hidden
        onTransitionEnd={readColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {gels.map((g, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: g.color }}
          />
        ))}
        <span
          className="transition-colors duration-1"
          style={{ color: backdrop }}
        />
      </span>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
