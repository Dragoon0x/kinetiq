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
  type UniformValue,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PicketArcProps = {
  /** Content shown above the sky, in its own layer: a headline, a call to action. */
  children?: React.ReactNode;
  /** How fast the arc sweeps across the sky, 0 (still) to 2. @default 0.6 */
  sweep?: number;
  /** How many green pickets hang beneath the arc, 8 to 64 (fewer on a narrow sky). @default 28 */
  pickets?: number;
  /** The arc's hue, degrees on the OKLCH wheel. @default 305 */
  hue?: number;
  /** The fence's hue, degrees. @default 150 */
  fenceHue?: number;
  /** How thick the arc is, 0.5 to 2. @default 1 */
  arcWidth?: number;
  /** How much the pickets flicker, 0 to 1. @default 0.6 */
  flicker?: number;
  /** How many stars, 0 to 1. @default 0.5 */
  stars?: number;
  /** How far the pointer bends the arc toward itself, 0 to 1. @default 0.6 */
  bend?: number;
  /** The pointer bends the arc and a drag sweeps it. @default true */
  interactive?: boolean;
  /** Hold the sky still. @default false */
  paused?: boolean;
  /** Places the stars and the ridge. @default 11 */
  seed?: number;
  /** Device-pixel-ratio cap for the canvas, at most 2. @default 2 */
  dpr?: number;
  /** The keyboard control's accessible name. @default "Night sky with a violet arc" */
  label?: string;
  /** Size the sky; it fills its box. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** The night itself: fixed pigments, the same in either theme. */
const SKY = {
  top: "oklch(0.15 0.04 268)",
  low: "oklch(0.25 0.05 252)",
  glow: "oklch(0.42 0.06 175)",
  ridge: "oklch(0.1 0.012 260)",
};

/** Where the arc's crest sits, and where the horizon is, in height units. */
const APEX = 0.24;
const RADIUS = 1.6;

const SKY_FRAG = `
in vec2 v_uv;
out vec4 o;
uniform float u_aspect;
uniform float u_time;
uniform float u_cx;        // the circle's centre x, height units
uniform vec3 u_bend;       // angle (rad), amount (height units), width (rad)
uniform float u_fade;      // the arc's visibility as it wraps
uniform float u_pickets;
uniform float u_drift;     // picket drift along the arc, in pickets
uniform float u_flicker;
uniform float u_stars;
uniform float u_width;
uniform float u_seed;
uniform float u_px;        // one pixel, height units
uniform vec3 u_top;
uniform vec3 u_low;
uniform vec3 u_glow;
uniform vec3 u_ridge;
uniform vec3 u_arc;
uniform vec3 u_fence;
${GLSL_NOISE}

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

float radiusAt(float a) {
  float da = a - u_bend.x;
  return ${RADIUS.toFixed(2)} + u_bend.y * exp(-(da * da) / (u_bend.z * u_bend.z));
}

void main() {
  vec2 p = vec2(v_uv.x * u_aspect, v_uv.y);
  vec2 c = vec2(u_cx, ${APEX.toFixed(2)} + ${RADIUS.toFixed(2)});

  // The ridge along the bottom.
  float ridgeY = 0.86 + 0.035 * (kx_fbm(vec2(p.x * 2.2 + u_seed, u_seed)) - 0.5) * 2.0
               + 0.012 * (kx_noise(vec2(p.x * 18.0, u_seed)) - 0.5);
  float below = smoothstep(ridgeY - u_px, ridgeY + u_px, p.y);

  // Sky: deep at the top, lifting toward the horizon, a faint airglow band.
  float t = clamp(p.y / ridgeY, 0.0, 1.0);
  vec3 sky = mix(lin(u_top), lin(u_low), t * t);
  sky += lin(u_glow) * 0.22 * exp(-pow((ridgeY - p.y) / 0.08, 2.0));

  // Stars: one candidate per cell, most of them dark.
  vec2 cell = floor(p * 90.0);
  float h = kx_hash(cell + u_seed);
  vec2 spot = cell + vec2(kx_hash(cell + 3.1), kx_hash(cell + 7.7));
  float sd = length(p * 90.0 - spot);
  float lit = step(1.0 - u_stars * 0.07, h);
  float tw = 0.65 + 0.35 * sin(u_time * (1.0 + h * 3.0) + h * 40.0);
  sky += vec3(0.9, 0.92, 1.0) * lit * tw * exp(-sd * sd * 16.0) * (0.2 + 0.5 * h) * (1.0 - t * 0.6);

  // The arc: distance to a circle whose radius the pointer bends.
  vec2 q = p - c;
  float a = atan(q.x, -q.y);
  float r = radiusAt(a);
  float d = abs(length(q) - r);
  float w = 0.0035 * u_width;
  float stria = 0.72 + 0.28 * kx_noise(vec2(a * 60.0, u_time * 0.15 + u_seed));
  float fadeLow = smoothstep(ridgeY, ridgeY - 0.3, p.y);
  float core = exp(-(d * d) / (w * w));
  float halo = exp(-d / (0.035 * u_width)) * 0.22;
  vec3 arc = lin(u_arc) * (core * 1.4 + halo) * stria * fadeLow * u_fade;

  // The fence: short vertical streaks hanging under the arc, each at its
  // own place along it, drifting and flickering on its own.
  vec3 fence = vec3(0.0);
  float span = 1.05;
  float step_ = (2.0 * span) / max(u_pickets, 1.0);
  float ax = clamp((p.x - c.x) / ${RADIUS.toFixed(2)}, -0.999, 0.999);
  float k = (asin(ax) + span - u_drift * step_) / step_;
  for (int j = -1; j <= 1; j++) {
    float idx = floor(k) + float(j);
    float pa = -span + (idx + 0.5) * step_ + u_drift * step_;
    if (abs(pa) > span) continue;
    float pr = radiusAt(pa);
    vec2 top = c + pr * vec2(sin(pa), -cos(pa));
    float hj = kx_hash(vec2(idx, u_seed + 1.7));
    float len = 0.07 + 0.06 * hj;
    float gap = 0.03 + 0.012 * hj;
    float y0 = top.y + gap;
    float y1 = y0 + len;
    float dx = (p.x - top.x) / (0.0028 * u_width + u_px);
    float across = exp(-dx * dx);
    float along = smoothstep(y0, y0 + 0.02, p.y) * (1.0 - smoothstep(y1 - 0.035, y1, p.y));
    float fl = kx_noise(vec2(idx * 3.7, u_time * (2.0 + hj * 3.0)));
    float bright = mix(1.0, 0.25 + 1.1 * fl * fl, u_flicker) * (0.55 + 0.45 * hj);
    fence += lin(u_fence) * across * along * bright;
  }
  fence *= fadeLow * u_fade * 0.9;

  vec3 col = sky + arc + fence;
  col = mix(col, lin(u_ridge), below);
  o = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

/* --------------------------------- engine --------------------------------- */

type Config = {
  sweep: number;
  pickets: number;
  hue: number;
  fenceHue: number;
  arcWidth: number;
  flicker: number;
  stars: number;
  bend: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Engine = {
  configure: (c: Config) => void;
  pointer: (x: number, y: number, on: boolean) => void;
  dragBy: (dxUnits: number) => void;
  release: (velocityUnits: number) => void;
  nudge: (dxUnits: number, bendBy: number) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const p = ctx.getImageData(0, 0, 1, 1).data;
    out[0] = (p[0] ?? 0) / 255;
    out[1] = (p[1] ?? 0) / 255;
    out[2] = (p[2] ?? 0) / 255;
  };
}

function createEngine(root: HTMLElement, canvas: HTMLCanvasElement): Engine {
  let cfg: Config | null = null;
  let gl: GLContext | null = null;
  let program: Program | null = null;
  let tri: FullscreenTriangle | null = null;
  let lost = false;
  let failed = false;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  const size = { w: 1, h: 1 };
  const read = rgbReader();
  const colours = {
    top: new Float32Array(3),
    low: new Float32Array(3),
    glow: new Float32Array(3),
    ridge: new Float32Array(3),
    arc: new Float32Array(3),
    fence: new Float32Array(3),
  };
  // The sky's state, advanced on the CPU and handed to one draw.
  let time = 7.5;
  let phase = 0.42;
  let coast = 0;
  let drift = 0;
  const bendNow = { a: 0, amt: 0, vel: 0 };
  const bendTarget = { a: 0, amt: 0 };
  let held = false;
  const bendV = new Float32Array(3);
  const uniforms: Record<string, UniformValue> = {
    u_aspect: 1,
    u_time: 0,
    u_cx: 0,
    u_bend: bendV,
    u_fade: 1,
    u_pickets: 28,
    u_drift: 0,
    u_flicker: 0.6,
    u_stars: 0.5,
    u_width: 1,
    u_seed: 11,
    u_px: 0.004,
    u_top: colours.top,
    u_low: colours.low,
    u_glow: colours.glow,
    u_ridge: colours.ridge,
    u_arc: colours.arc,
    u_fence: colours.fence,
  };

  /** The arc's circle centre across a sweep from just off the left to just off the right. */
  const span = () => {
    const aspect = size.w / Math.max(1, size.h);
    return { from: -0.5, to: aspect + 0.5 };
  };
  const centreX = () => {
    const s = span();
    const f = ((phase % 1) + 1) % 1;
    return s.from + f * (s.to - s.from);
  };

  const readColours = () => {
    const c = cfg;
    read(SKY.top, colours.top);
    read(SKY.low, colours.low);
    read(SKY.glow, colours.glow);
    read(SKY.ridge, colours.ridge);
    read(`oklch(0.74 0.19 ${Math.round(c?.hue ?? 305)})`, colours.arc);
    read(`oklch(0.86 0.21 ${Math.round(c?.fenceHue ?? 150)})`, colours.fence);
  };

  const build = (): boolean => {
    gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    program = createProgram(gl, FULLSCREEN_VERTEX, SKY_FRAG);
    if (!program) return false;
    tri = createFullscreenTriangle(gl, program);
    lost = false;
    return true;
  };

  const releaseGL = () => {
    if (!gl || lost) return;
    tri?.dispose();
    program?.dispose();
    tri = null;
    program = null;
  };

  const draw = () => {
    const c = cfg;
    if (!gl || !program || !tri || lost || !c || size.w < 1) return;
    const aspect = size.w / Math.max(1, size.h);
    const cx = centreX();
    const s = span();
    // Fades as it leaves on one side and comes in on the other.
    const fade = clamp01((cx - s.from) / 0.35) * clamp01((s.to - cx) / 0.35);
    // Fewer pickets on a narrow sky, so they stay pickets and not a wash.
    const n = clamp(Math.round(c.pickets * clamp(aspect / 3, 0.45, 1)), 8, 64);
    bendV[0] = bendNow.a;
    bendV[1] = bendNow.amt;
    bendV[2] = 0.22;
    uniforms.u_aspect = aspect;
    uniforms.u_time = time;
    uniforms.u_cx = cx;
    uniforms.u_fade = fade;
    uniforms.u_pickets = n;
    uniforms.u_drift = drift;
    uniforms.u_flicker = c.motionSafe ? clamp01(c.flicker) : 0;
    uniforms.u_stars = clamp01(c.stars);
    uniforms.u_width = clamp(c.arcWidth, 0.5, 2);
    uniforms.u_seed = (c.seed % 97) * 0.731;
    uniforms.u_px = 1 / Math.max(1, size.h);
    program.set(uniforms);
    tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    time += dt;
    const aspect = size.w / Math.max(1, size.h);
    const across = aspect + 1;
    // A slow sweep, plus whatever a throw left behind, coasting down.
    if (!held) {
      phase += (dt * clamp(c.sweep, 0, 2) * 0.028 * 3.3) / across;
      phase += (coast * dt) / across;
      coast *= Math.exp(-dt * 2.6);
    }
    // Each picket keeps its own index as it drifts, so it never jumps; the
    // count wraps only after hours.
    drift = (drift + dt * 0.08) % 1000;
    // The bend follows its target on the glide spring's constants.
    const { stiffness, damping, mass } = springs.glide;
    const amt = bendTarget.amt * clamp01(c.bend);
    const acc =
      (stiffness * (amt - bendNow.amt) - damping * bendNow.vel) / mass;
    bendNow.vel += acc * dt;
    bendNow.amt += bendNow.vel * dt;
    bendNow.a += (bendTarget.a - bendNow.a) * Math.min(1, dt * 10);
  };

  const running = () => {
    const c = cfg;
    return Boolean(
      c && c.motionSafe && !c.paused && visible && !document.hidden && !lost,
    );
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !running()) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    draw();
    frame = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (disposed || frame || !running()) return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Without motion the sky is drawn once per change, with every spring settled. */
  const still = () => {
    bendNow.amt = bendTarget.amt * clamp01(cfg?.bend ?? 0.6);
    bendNow.a = bendTarget.a;
    bendNow.vel = 0;
    draw();
  };

  const resize = () => {
    if (!gl || lost || !cfg) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    const cap = clamp(cfg.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? 0.75 : 1,
    });
    draw();
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
      if (failed) return;
      if (!gl) {
        if (!start()) {
          failed = true;
          root.setAttribute("data-fallback", "");
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            root.removeAttribute("data-live");
          },
          () => {
            gl = null;
            if (!disposed && start()) kick();
          },
        );
        kick();
        return;
      }
      if (was && (was.hue !== next.hue || was.fenceHue !== next.fenceHue))
        readColours();
      if (was && was.dpr !== next.dpr) resize();
      if (next.motionSafe) kick();
      else still();
      draw();
    },
    pointer(x, y, on) {
      const aspect = size.w / Math.max(1, size.h);
      const px = x * aspect;
      const cx = centreX();
      const cy = APEX + RADIUS;
      const dx = px - cx;
      const dy = y - cy;
      // Pull the part of the arc nearest the pointer toward it.
      bendTarget.a = Math.atan2(dx, -dy);
      bendTarget.amt = on ? clamp(Math.hypot(dx, dy) - RADIUS, -0.22, 0.22) : 0;
      if (!cfg?.motionSafe) still();
      kick();
    },
    dragBy(dxUnits) {
      held = true;
      coast = 0;
      const across = size.w / Math.max(1, size.h) + 1;
      phase += dxUnits / across;
      if (!cfg?.motionSafe) still();
      kick();
    },
    release(velocityUnits) {
      held = false;
      coast = clamp(velocityUnits, -6, 6);
      kick();
    },
    nudge(dxUnits, bendBy) {
      const across = size.w / Math.max(1, size.h) + 1;
      // A key is a small throw: it coasts exactly `dxUnits` before it stops.
      if (cfg?.motionSafe) coast += dxUnits * 2.6;
      else phase += dxUnits / across;
      if (bendBy) {
        bendTarget.a = 0;
        bendTarget.amt = clamp(bendTarget.amt + bendBy, -0.22, 0.22);
      }
      if (!cfg?.motionSafe) still();
      kick();
    },
    resize,
    setVisible(on) {
      visible = on;
      if (on) {
        draw();
        kick();
      }
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
      releaseGL();
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component ------------------------------- */

/** What a backdrop must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/**
 * A night sky over a low ridge, drawn in one WebGL2 pass behind its content:
 * deep blue-black lifting to the horizon, faint airglow, sparse twinkling
 * stars, and across it a single narrow arc of violet light — part of a huge
 * circle centred far below the horizon, a fine core inside a wide faint halo
 * with striations along it — with a row of short green streaks hanging
 * beneath like a picket fence, each flickering on its own and drifting
 * slowly along the arc. The arc sweeps slowly across the sky.
 *
 * The pointer bends the part of the arc nearest it toward itself on the
 * glide spring's constants, and it relaxes when the pointer leaves; a
 * horizontal drag carries the arc 1:1 and a throw coasts on, by projection,
 * back into the slow sweep. The sky is decoration (aria-hidden) and never
 * takes a click from the content above it; the keyboard's way in is a
 * transparent button behind the content — Left and Right sweep the arc, Up
 * and Down bend it. Under reduced motion the sky is a still frame, redrawn
 * when something changes.
 */
export function PicketArc({
  children,
  sweep = 0.6,
  pickets = 28,
  hue = 305,
  fenceHue = 150,
  arcWidth = 1,
  flicker = 0.6,
  stars = 0.5,
  bend = 0.6,
  interactive = true,
  paused = false,
  seed = 11,
  dpr = 2,
  label = "Night sky with a violet arc",
  className,
}: PicketArcProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const dragRef = React.useRef<{
    id: number;
    x: number;
    last: number;
    t: number;
    v: number;
    active: boolean;
  } | null>(null);

  const config: Config = {
    sweep,
    pickets,
    hue,
    fenceHue,
    arcWidth,
    flicker,
    stars,
    bend,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const e = createEngine(root, canvas);
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
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

  const local = (clientX: number, clientY: number) => {
    const el = rootRef.current;
    const r = el?.getBoundingClientRect();
    if (!el || !r || r.width < 1 || r.height < 1) return null;
    return {
      x: (clientX - r.left) / r.width,
      y: (clientY - r.top) / r.height,
      h: r.height,
    };
  };

  const fromContent = (target: EventTarget | null) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(
      hit && hit !== surfaceRef.current && rootRef.current?.contains(hit),
    );
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const at = local(event.clientX, event.clientY);
    if (!at) return;
    const d = dragRef.current;
    if (d && d.id === event.pointerId) {
      const dx = event.clientX - d.last;
      if (!d.active && Math.abs(event.clientX - d.x) > 4) {
        d.active = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer may already be gone; the drag still follows moves.
        }
      }
      if (d.active) {
        const dt = Math.max(8, event.timeStamp - d.t) / 1000;
        d.v = d.v * 0.4 + (dx / at.h / dt) * 0.6;
        engine.current?.dragBy(dx / at.h);
      }
      d.last = event.clientX;
      d.t = event.timeStamp;
    }
    if (event.pointerType !== "touch")
      engine.current?.pointer(at.x, at.y, true);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== event.pointerId) return;
    dragRef.current = null;
    if (!d.active) return;
    // The throw's speed carries on and coasts down under friction to where
    // it would come to rest, then the slow sweep takes over again.
    const v = Math.abs(event.timeStamp - d.t) > 90 ? 0 : d.v;
    engine.current?.release(v);
  };

  const step = (event: React.KeyboardEvent) => (event.shiftKey ? 0.6 : 0.18);

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (!interactive || fromContent(event.target)) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        dragRef.current = {
          id: event.pointerId,
          x: event.clientX,
          last: event.clientX,
          t: event.timeStamp,
          v: 0,
          active: false,
        };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        if (!dragRef.current?.active) engine.current?.pointer(0.5, 0.5, false);
      }}
      className={cn(
        "group/picket-arc relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      {/* The stand-in: the server's frame and the sky without WebGL2. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-live/picket-arc:hidden"
        style={{
          backgroundColor: SKY.top,
          backgroundImage: `radial-gradient(ellipse 130% 160% at 50% 175%, transparent 92.4%, oklch(0.74 0.19 ${Math.round(hue)} / 0.9) 93%, oklch(0.74 0.19 ${Math.round(hue)} / 0.16) 94.4%, transparent 98.5%), linear-gradient(to bottom, ${SKY.top}, ${SKY.low} 86%, ${SKY.ridge} 86.5%)`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/picket-arc:opacity-100"
      />
      <button
        ref={surfaceRef}
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={!interactive}
        onKeyDown={(event) => {
          const by = step(event);
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            engine.current?.nudge(event.key === "ArrowLeft" ? -by : by, 0);
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            engine.current?.nudge(0, event.key === "ArrowUp" ? -0.06 : 0.06);
          }
        }}
        className={cn(
          "absolute inset-0 z-0 size-full cursor-default rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Left and Right arrow keys sweep the arc across the sky; Up and Down bend
        it.
      </p>
    </div>
  );
}
