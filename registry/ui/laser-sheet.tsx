"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type UniformValue,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LaserSheetColor = "cobalt" | "signal" | "ember" | "rose";

export type LaserSheetProps = {
  /** How thick the air is, 0 to 1: from clear air where only the floor line shows to a dense, glowing fan. @default 0.55 */
  haze?: number;
  /** How fast the sheet sweeps on its own, 0 (holds still) to 1 (a pass every couple of seconds). @default 0.35 */
  sweep?: number;
  /** The beam's colour: a named tone or any CSS colour. @default "cobalt" */
  color?: LaserSheetColor | (string & {});
  /** Half the fan's opening, in degrees. @default 32 */
  spread?: number;
  /** How far the sheet swings either way, in degrees. @default 50 */
  range?: number;
  /** How far the beam trails the pointer, 0 (springs.glide) to 1 (springs.drift). @default 0.5 */
  lag?: number;
  /** How much dust glints in the sheet, 0 to 1. @default 0.5 */
  dust?: number;
  /** How bright the floor line and its spill are, 0 to 1. @default 0.7 */
  glow?: number;
  /** Draw a faint perspective grid on the floor. @default true */
  grid?: boolean;
  /** Where the emitter hangs, as [x, y] fractions of the box. @default [0.5, 0.08] */
  source?: readonly [number, number];
  /** Steer with the pointer and keyboard focus; a press fires a pulse down the sheet. @default true */
  interactive?: boolean;
  /** Freeze the beam where it is. @default false */
  paused?: boolean;
  /** Seed for the haze. @default 3 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a press or a keyboard activation fires a pulse. */
  onFire?: () => void;
  /** Classes for the box; size it and give it its background here. */
  className?: string;
  /** Content laid over the scene; it keeps every click, focus and key. */
  children?: React.ReactNode;
};

const TONES: Record<LaserSheetColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "oklch(from var(--warn) 0.76 c h)",
  rose: "oklch(from var(--danger) 0.68 c h)",
};

/** The camera: focal length and horizon as shares of the box height. */
const FOCAL = 1.05;
const HORIZON = 0.56;
/** How deep the emitter hangs in the room, in floor units. */
const DEPTH = 6;
/** How fast a fired pulse runs down the sheet, in floor units per second. */
const PULSE_SPEED = 9;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_focal;
uniform float u_horizon;
uniform vec3 u_emitter;
uniform vec3 u_down;
uniform vec3 u_side;
uniform vec3 u_normal;
uniform float u_spread;
uniform float u_time;
uniform float u_haze;
uniform float u_dust;
uniform float u_glow;
uniform float u_grid;
uniform vec2 u_pulse;
uniform vec3 u_bg;
uniform vec3 u_ink;
uniform vec3 u_beam;
uniform float u_dark;
uniform vec2 u_seed;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

float sq(float x) { return x * x; }

vec2 toScreen(vec3 p) {
  return vec2(
    u_res.x * 0.5 + u_focal * p.x / p.z,
    u_horizon - u_focal * (p.y - 1.0) / p.z
  );
}

// How much of the fan a point (relative to the emitter) sits in, with soft
// edges at the fan's sides.
float fan(vec3 rel) {
  float a = dot(rel, u_down);
  if (a <= 0.0) return 0.0;
  float angle = abs(atan(dot(rel, u_side), a));
  // Rays that leave the emitter nearly level would graze the floor out at
  // the horizon and draw a stray line through the content: the fan stops
  // short of them.
  float steep = -rel.y / max(length(rel), 1e-4);
  return (1.0 - smoothstep(u_spread * 0.8, u_spread, angle)) *
    smoothstep(0.26, 0.45, steep);
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 eye = vec3(0.0, 1.0, 0.0);
  vec3 dir = normalize(vec3(
    (px.x - u_res.x * 0.5) / u_focal,
    (u_horizon - px.y) / u_focal,
    1.0
  ));
  float tFloor = dir.y < -0.0001 ? 1.0 / -dir.y : 1e6;
  vec3 colour = u_bg;
  float light = 0.0;
  float core = 0.0;

  if (tFloor < 1e5) {
    vec3 pf = eye + dir * tFloor;
    float near = clamp(1.0 - tFloor / 16.0, 0.0, 1.0);
    // The floor: a faint perspective grid, a touch more ink close by.
    vec2 g = pf.xz * 1.5;
    vec2 gw = max(fwidth(g), vec2(1e-4));
    vec2 lines = 1.0 - smoothstep(vec2(0.0), gw * 1.2, abs(fract(g - 0.5) - 0.5));
    float grid = max(lines.x, lines.y) * u_grid * 0.08 * near * near;
    colour = mix(colour, u_ink, grid + near * 0.03);
    // Where the sheet meets the floor: a line about 1.5px wide at any depth,
    // a spill of light around it, and a flare when a pulse arrives.
    vec3 rel = pf - u_emitter;
    float side = dot(rel, u_normal);
    float fw = max(fwidth(side), 1e-4);
    float inFan = fan(rel);
    float line = exp(-sq(side / (fw * 1.1)));
    float spill = exp(-sq(side / 0.2)) * 0.3 + exp(-sq(side / 0.8)) * 0.07;
    float flare = u_pulse.y * exp(-sq((length(rel) - u_pulse.x) / 0.7)) * 2.5;
    light += inFan * u_glow * (line * 1.7 + spill * (0.5 + 1.4 * u_haze)) * (1.0 + flare);
    core += inFan * u_glow * line * (0.5 + flare);
  }

  // The sheet: one thin plane of light, seen through the haze. The path a
  // ray travels inside it grows as the sheet turns edge-on.
  float facing = dot(u_normal, dir);
  float tSheet = abs(facing) > 1e-4 ? dot(u_normal, u_emitter - eye) / facing : -1.0;
  if (tSheet > 0.0 && tSheet < tFloor) {
    vec3 p = eye + dir * tSheet;
    vec3 rel = p - u_emitter;
    float inFan = fan(rel);
    if (inFan > 0.0 && p.y > 0.0) {
      float dist = length(rel);
      float path = 0.022 / max(abs(facing), 0.07);
      vec2 q = vec2(dot(rel, u_side), dot(rel, u_down));
      float swirl = kx_fbm(q * 1.3 + u_seed + vec2(u_time * 0.05, -u_time * 0.035) + p.z * 0.25);
      float density = mix(0.18, 0.35 + swirl * 1.3, u_haze);
      float fall = 1.0 / (1.0 + dist * 0.3);
      float front = u_pulse.y * exp(-sq((dist - u_pulse.x) / 0.35)) * 3.0;
      light += inFan * path * density * fall * 14.0 * (1.0 + front);
      core += inFan * front * path * 2.0;

      // Dust in the sheet's own plane, glinting only while it crosses it.
      float cell = 0.16;
      vec2 base = floor(q / cell);
      for (int i = -1; i <= 1; i += 1) {
        for (int j = -1; j <= 1; j += 1) {
          vec2 c = base + vec2(float(i), float(j));
          float h = kx_hash(c + u_seed * 7.0);
          if (h > u_dust * 0.3) continue;
          float h2 = kx_hash(c + 19.3);
          vec2 drift = vec2(sin(u_time * 0.31 + h * 40.0), cos(u_time * 0.23 + h2 * 30.0)) * 0.3;
          vec2 m = (c + 0.5 + (vec2(h, h2) - 0.5) * 0.7 + drift) * cell;
          vec3 world = u_emitter + u_side * m.x + u_down * m.y;
          if (world.z < 0.2 || world.y < 0.0) continue;
          float d = length(px - toScreen(world));
          float glint = pow(max(0.0, sin(u_time * (0.5 + h2) + h * 50.0)), 16.0) * (0.5 + h2);
          float flash = 1.0 + u_pulse.y * exp(-sq((length(world - u_emitter) - u_pulse.x) / 0.6)) * 4.0;
          float spark = exp(-d * d / 2.2) * glint * flash * fan(world - u_emitter);
          light += spark * 1.6;
          core += spark * 0.8;
        }
      }
    }
  }

  // The emitter: a small hot core and a halo in the haze around it.
  vec2 ep = toScreen(u_emitter);
  float ed = length(px - ep);
  light += exp(-ed * ed / 24.0) * 2.2 + exp(-ed * ed / 1400.0) * (0.12 + 0.3 * u_haze);
  core += exp(-ed * ed / 10.0) * 1.4;

  if (u_dark > 0.5) {
    // Light adds on a dark room, the brightest parts burning toward white.
    colour += u_beam * light;
    colour = mix(colour, vec3(1.0), clamp(core * 0.4, 0.0, 0.85));
  } else {
    // On a pale room the beam is laid down as pigment over the haze.
    float k = 1.0 - exp(-light * 0.95);
    colour = mix(colour, u_beam, k * 0.9);
    colour = mix(colour, u_beam * 0.62, clamp(core * 0.3, 0.0, 0.6));
  }
  o_color = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`;

type Vec3 = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * One step of a damped spring with the house constants: the new velocity,
 * semi-implicit, so the caller moves by it. Returning a number, not a pair,
 * keeps the frame loop free of allocations.
 */
function springStep(
  pos: number,
  vel: number,
  target: number,
  spring: { stiffness: number; damping: number; mass: number },
  dt: number,
): number {
  return (
    vel +
    ((spring.stiffness * (target - pos) - spring.damping * vel) / spring.mass) *
      dt
  );
}

type SheetFrame = {
  down: Float32Array;
  side: Float32Array;
  normal: Float32Array;
};

/**
 * The sheet's frame for a swing angle, written into `out`: its central ray,
 * the direction across the fan, and its normal. The sheet hangs facing the
 * viewer and turns edge-on as it swings out, so it brightens toward either
 * end of a sweep.
 */
function sheetFrame(swing: number, out: SheetFrame): void {
  const dx = Math.sin(swing);
  const dy = -Math.cos(swing);
  const twist = 0.3 + 0.55 * Math.abs(swing);
  // The normal leans from facing the viewer toward the direction across the
  // swing, (-cos, -sin, 0), by the twist.
  const nx = Math.sin(twist) * -Math.cos(swing);
  const ny = Math.sin(twist) * -Math.sin(swing);
  const nz = Math.cos(twist);
  const n = Math.hypot(nx, ny, nz) || 1;
  out.down[0] = dx;
  out.down[1] = dy;
  out.down[2] = 0;
  out.normal[0] = nx / n;
  out.normal[1] = ny / n;
  out.normal[2] = nz / n;
  // side = normal × down
  const sx = (ny / n) * 0 - (nz / n) * dy;
  const sy = (nz / n) * dx - (nx / n) * 0;
  const sz = (nx / n) * dy - (ny / n) * dx;
  const len = Math.hypot(sx, sy, sz) || 1;
  out.side[0] = sx / len;
  out.side[1] = sy / len;
  out.side[2] = sz / len;
}

/**
 * A volumetric laser sheet in a hazy room, drawn per pixel in one WebGL2 pass
 * behind the content it wraps. An emitter hangs near the top; from it a thin
 * sheet of light fans down through the haze and meets the floor in a crisp
 * bright line with a spill of light around it. For every pixel the view ray
 * is met with the sheet: the drifting haze there scatters light in proportion
 * to the path the ray travels inside the thin sheet, so the sheet glows faint
 * and textured while it faces you and burns into a bright blade as it turns
 * edge-on, and dust glints only while it crosses the plane. Left alone the
 * sheet sweeps back and forth; the pointer steers it instead, the angle
 * trailing on a damped spring between springs.glide and springs.drift, and a
 * press fires a bright pulse down the sheet that flares the line when it lands.
 *
 * Keyboard focus aims the sheet at the focused control and Enter or Space on
 * it fires. Without WebGL2, or after a lost context, a CSS still of the fan
 * and its line stands in. Under reduced motion the scene is one still frame;
 * presses and focus re-aim it instantly and never fire.
 */
export function LaserSheet({
  haze = 0.55,
  sweep = 0.35,
  color = "cobalt",
  spread = 32,
  range = 50,
  lag = 0.5,
  dust = 0.5,
  glow = 0.7,
  grid = true,
  source = [0.5, 0.08],
  interactive = true,
  paused = false,
  seed = 3,
  dpr = 2,
  onFire,
  className,
  children,
}: LaserSheetProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const api = React.useRef<{
    recolour: () => void;
    wake: () => void;
  } | null>(null);

  const tone = TONES[color as LaserSheetColor] ?? color;
  const sx = clamp(source[0], 0, 1);
  const sy = clamp(source[1], 0, 0.5);

  const params = React.useRef({
    haze,
    sweep,
    tone,
    spread,
    range,
    lag,
    dust,
    glow,
    grid,
    sx,
    sy,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onFire,
  });
  React.useEffect(() => {
    params.current = {
      haze,
      sweep,
      tone,
      spread,
      range,
      lag,
      dust,
      glow,
      grid,
      sx,
      sy,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
      onFire,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || failed) return;
    const gl = createGL(canvas, { alpha: false });
    const program = gl ? createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT) : null;
    if (!gl || !program) {
      // No WebGL2 here: the CSS still is the component, settled once.
      const frame = requestAnimationFrame(() => setFailed(true));
      return () => cancelAnimationFrame(frame);
    }
    const tri = createFullscreenTriangle(gl, program);

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let clock = 0;
    let inView = true;
    let lost = false;
    let shown = false;
    let readyFrame = 0;
    let bg: Vec3 = [0.1, 0.11, 0.14];
    let ink: Vec3 = [0.9, 0.9, 0.95];
    let beam: Vec3 = [0.4, 0.55, 1];
    let dark = 1;
    // Everything the shader reads lives in arrays made once and filled in
    // place, so a frame allocates nothing.
    const frame: SheetFrame = {
      down: new Float32Array(3),
      side: new Float32Array(3),
      normal: new Float32Array(3),
    };
    const res = new Float32Array(2);
    const emitter = new Float32Array(3);
    const pulse = new Float32Array(2);
    const seedOffset = new Float32Array(2);
    const bgU = new Float32Array(3);
    const inkU = new Float32Array(3);
    const beamU = new Float32Array(3);
    const uniforms: Record<string, UniformValue> = {
      u_res: res,
      u_focal: 1,
      u_horizon: 1,
      u_emitter: emitter,
      u_down: frame.down,
      u_side: frame.side,
      u_normal: frame.normal,
      u_spread: 0.5,
      u_time: 0,
      u_haze: 0.5,
      u_dust: 0.5,
      u_glow: 0.7,
      u_grid: 1,
      u_pulse: pulse,
      u_bg: bgU,
      u_ink: inkU,
      u_beam: beamU,
      u_dark: 1,
      u_seed: seedOffset,
    };
    const blend = { stiffness: 0, damping: 0, mass: 1 };
    // The swing, its velocity, and the clock its own sweep runs on.
    const swing = { angle: 0, v: 0, placed: false, sweepClock: 0 };
    const pointer = { x: 0, y: 0, inside: false };
    let focused: HTMLElement | null = null;
    // A fired pulse: how long ago, or -1 for none.
    let pulseAge = -1;
    // Reduced motion aims the still here (an angle), or rests at -99.
    let stillAim = -99;

    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const rgb = (css: string, under?: string): Vec3 => {
      const probe = probeRef.current;
      if (!probe || !reader) return [0.5, 0.5, 0.5];
      reader.clearRect(0, 0, 1, 1);
      if (under) {
        probe.style.color = under;
        reader.fillStyle = getComputedStyle(probe).color;
        reader.fillRect(0, 0, 1, 1);
      }
      probe.style.color = css;
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = getComputedStyle(probe).color;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return [(d[0] ?? 128) / 255, (d[1] ?? 128) / 255, (d[2] ?? 128) / 255];
    };
    const recolour = () => {
      // The room is the box's own background, over the page's.
      bg = rgb(getComputedStyle(root).backgroundColor, "var(--background)");
      ink = rgb("var(--foreground)");
      dark = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] < 0.5 ? 1 : 0;
      const b = rgb(params.current.tone);
      // On a pale room the beam is pigment: a touch deeper reads truer.
      beam = dark ? b : [b[0] * 0.8, b[1] * 0.8, b[2] * 0.8];
      bgU.set(bg);
      inkU.set(ink);
      beamU.set(beam);
    };

    const emitterScreen = () => {
      const p = params.current;
      return { x: p.sx * w, y: p.sy * h };
    };

    /** The swing that points the sheet's central ray at a point on screen. */
    const aimAt = (x: number, y: number) => {
      const e = emitterScreen();
      const limit = toRad(clamp(params.current.range, 0, 85));
      return clamp(Math.atan2(x - e.x, Math.max(1, y - e.y)), -limit, limit);
    };

    const restAngle = () => toRad(clamp(params.current.range, 0, 85)) * 0.45;

    const draw = () => {
      if (lost || gl.isContextLost() || w < 1 || h < 1) return;
      const p = params.current;
      resizeGL(gl, canvas, { dprCap: Math.min(2, Math.max(1, p.dpr)) });
      const focal = h * FOCAL;
      const horizon = h * HORIZON;
      const e = emitterScreen();
      // The emitter in the room: back along the ray through its point on
      // screen, at the room's depth.
      emitter[0] = (DEPTH * (e.x - w / 2)) / focal;
      emitter[1] = 1 + (DEPTH * (horizon - e.y)) / focal;
      emitter[2] = DEPTH;
      sheetFrame(
        p.motionSafe ? swing.angle : stillAim > -99 ? stillAim : restAngle(),
        frame,
      );
      res[0] = w;
      res[1] = h;
      pulse[0] = pulseAge >= 0 ? pulseAge * PULSE_SPEED : 0;
      pulse[1] = pulseAge >= 0 ? Math.exp(-pulseAge * 1.4) : 0;
      seedOffset[0] = (p.seed * 7.13) % 50;
      seedOffset[1] = (p.seed * 3.71) % 50;
      uniforms.u_focal = focal;
      uniforms.u_horizon = horizon;
      uniforms.u_spread = toRad(clamp(p.spread, 4, 80));
      uniforms.u_time = p.motionSafe ? clock : 12;
      uniforms.u_haze = clamp(p.haze, 0, 1);
      uniforms.u_dust = clamp(p.dust, 0, 1);
      uniforms.u_glow = clamp(p.glow, 0, 1);
      uniforms.u_grid = p.grid ? 1 : 0;
      uniforms.u_dark = dark;
      program.use();
      program.set(uniforms);
      tri.draw();
      if (!shown) {
        shown = true;
        readyFrame = requestAnimationFrame(() => setReady(true));
      }
    };

    const steering = () => {
      const p = params.current;
      return p.interactive && (pointer.inside || focused !== null);
    };

    const step = (dt: number) => {
      const p = params.current;
      clock += dt;
      let target: number;
      if (steering() && focused && focused.isConnected) {
        const box = root.getBoundingClientRect();
        const r = focused.getBoundingClientRect();
        target = aimAt(
          r.left + r.width / 2 - box.left,
          r.top + r.height / 2 - box.top,
        );
      } else if (steering()) {
        target = aimAt(pointer.x, pointer.y);
      } else {
        // Alone, it sweeps on its own clock; `sweep` 0 holds it at rest.
        const hz = clamp(p.sweep, 0, 1) * 0.22;
        swing.sweepClock += dt * hz;
        target =
          hz > 0
            ? toRad(clamp(p.range, 0, 85)) *
              Math.sin(swing.sweepClock * Math.PI * 2)
            : restAngle();
      }
      if (!swing.placed) {
        swing.angle = target;
        swing.placed = true;
      }
      const t = clamp(p.lag, 0, 1);
      blend.stiffness = lerp(
        springs.glide.stiffness,
        springs.drift.stiffness,
        t,
      );
      blend.damping = lerp(springs.glide.damping, springs.drift.damping, t);
      blend.mass = lerp(springs.glide.mass, springs.drift.mass, t);
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < steps; i += 1) {
        swing.v = springStep(swing.angle, swing.v, target, blend, dt / steps);
        swing.angle += (swing.v * dt) / steps;
      }
      if (pulseAge >= 0) {
        pulseAge += dt;
        if (pulseAge > 1.4) pulseAge = -1;
      }
    };

    const canRun = () => {
      const p = params.current;
      return (
        inView &&
        !document.hidden &&
        !p.paused &&
        p.motionSafe &&
        !lost &&
        w > 0
      );
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      carry += dt;
      // Sweeping on its own the scene is slow: about 30 frames a second is
      // plenty. Steered or firing, every frame.
      if (steering() || pulseAge >= 0 || carry >= 1 / 32) {
        step(carry);
        carry = 0;
        draw();
      }
      if (canRun()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf || !canRun()) return;
      last = performance.now();
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
      draw();
      wake();
    };

    const local = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    const fire = (x: number, y: number) => {
      const p = params.current;
      if (!p.interactive || p.paused) return;
      if (!p.motionSafe) {
        // Reduced motion: the still re-aims there, instantly, and nothing fires.
        stillAim = aimAt(x, y);
        draw();
        return;
      }
      pulseAge = 0;
      p.onFire?.();
      wake();
    };

    const onMove = (event: PointerEvent) => {
      if (!params.current.interactive) return;
      const pt = local(event.clientX, event.clientY);
      pointer.x = pt.x;
      pointer.y = pt.y;
      pointer.inside = true;
      wake();
    };
    const onLeave = () => {
      pointer.inside = false;
      wake();
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") onLeave();
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const pt = local(event.clientX, event.clientY);
      fire(pt.x, pt.y);
    };
    // Enter or Space on a control inside: a click with no pointer behind it.
    const onClick = (event: MouseEvent) => {
      if (event.detail !== 0) return;
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      const r = el.getBoundingClientRect();
      const pt = local(r.left + r.width / 2, r.top + r.height / 2);
      fire(pt.x, pt.y);
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!el.matches(":focus-visible") || !params.current.interactive) return;
      focused = el;
      if (!params.current.motionSafe) {
        const r = el.getBoundingClientRect();
        const pt = local(r.left + r.width / 2, r.top + r.height / 2);
        stillAim = aimAt(pt.x, pt.y);
        draw();
      }
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      focused = null;
      wake();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointercancel", onLeave);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(resize);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
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
      setReady(false);
      setFailed(true);
    });

    recolour();
    resize();
    api.current = {
      recolour: () => {
        recolour();
        draw();
      },
      wake: () => {
        if (!params.current.interactive) {
          pointer.inside = false;
          focused = null;
        }
        draw();
        wake();
      },
    };

    return () => {
      halt();
      cancelAnimationFrame(readyFrame);
      lost = true;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detach();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointercancel", onLeave);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      tri.dispose();
      program.dispose();
      api.current = null;
    };
  }, [failed]);

  React.useEffect(() => {
    api.current?.recolour();
  }, [tone]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    haze,
    sweep,
    spread,
    range,
    lag,
    dust,
    glow,
    grid,
    sx,
    sy,
    interactive,
    paused,
    seed,
    motionSafe,
    dpr,
  ]);

  // The still: a conic fan from the emitter and its line on the floor, drawn
  // in CSS for the server, the first paint, and any browser without WebGL2.
  // It hangs straight down, where the live sweep starts, so its line sits
  // under the emitter at any aspect and the hand-over to the canvas is calm.
  const half = clamp(spread, 4, 80);
  const fanStill = `conic-gradient(from ${180 - half}deg at ${r2(sx * 100)}% ${r2(sy * 100)}%, transparent 0deg, color-mix(in oklab, ${tone} 22%, transparent) ${half}deg, transparent ${half * 2}deg, transparent 360deg)`;
  const lineStill = `linear-gradient(to right, transparent, ${tone} 30%, ${tone} 70%, transparent)`;

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate overflow-hidden", className)}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity",
          ready && "opacity-0",
        )}
        style={{
          transitionDuration: `${Math.round(durations.slow * 1000)}ms`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: fanStill,
            maskImage: "linear-gradient(to bottom, black 55%, transparent 90%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 55%, transparent 90%)",
          }}
        />
        <div
          className="absolute h-px"
          style={{
            left: `${r2(sx * 100 - 18)}%`,
            width: "36%",
            top: `${Math.round((HORIZON + FOCAL / DEPTH) * 100)}%`,
            background: lineStill,
            filter: `drop-shadow(0 0 4px color-mix(in oklab, ${tone} 60%, transparent))`,
          }}
        />
        <div
          className="absolute size-1.5 -translate-1/2 rounded-full"
          style={{
            left: `${r2(sx * 100)}%`,
            top: `${r2(sy * 100)}%`,
            background: tone,
            boxShadow: `0 0 10px 3px color-mix(in oklab, ${tone} 55%, transparent)`,
          }}
        />
      </div>
      {failed ? null : (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
      )}
      <div className="relative size-full">{children}</div>
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
