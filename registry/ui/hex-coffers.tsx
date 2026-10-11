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
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HexCoffersProps = {
  /** The content under the vault: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The width of one coffer, px, 24 to 96. @default 56 */
  cellSize?: number;
  /** How deep the coffers are recessed, 0 (shallow) to 1 (deep wells). @default 0.5 */
  depth?: number;
  /** The lamp's light, 0 (cool white) to 1 (warm amber). @default 0.6 */
  lampWarmth?: number;
  /** How far the lamp hangs below the vault at rest, 0 (close) to 1 (far). @default 0.5 */
  lampHeight?: number;
  /** How far a press lowers the lamp into the vault, 0 (not at all) to 1 (almost touching). @default 0.7 */
  press?: number;
  /** The width of each coffer's sloped inner walls, 0 (steep) to 1 (wide bevels). @default 0.45 */
  bevel?: number;
  /** The width of the flat ridge between coffers, 0 to 1. @default 0.14 */
  rim?: number;
  /** A small round boss at the centre of each coffer. @default true */
  boss?: boolean;
  /** How bright the lamp burns, 0 to 1.5. @default 1 */
  intensity?: number;
  /** How fast the lamp drifts on its figure of eight when no one carries it, 0 (still) to 1. @default 0.5 */
  drift?: number;
  /** The pointer carries the lamp and a press lowers it; the keys do the same. @default true */
  interactive?: boolean;
  /** How closely the lamp follows the hand, 0 (it stays on its drift) to 1 (under the pointer). @default 1 */
  pointerStrength?: number;
  /** Hold the figure of eight still; the hand still carries the lamp. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The vault's accessible name, for the keyboard's way in. @default "Coffered ceiling" */
  label?: string;
  /** The lamp was lowered (true) or lifted (false), by the pointer or the keys that did it. */
  onPressChange?: (pressed: boolean) => void;
  /** A hand took the lamp (true: the pointer over the vault, or the keys) or gave it back to its drift (false). */
  onCarryChange?: (carried: boolean) => void;
  /** The vault is lit and still; the hand is ignored. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
};

/** The edges are crisp: a little under the capped pixel ratio, not half. */
const RENDER_SCALE = 0.75;
const STEP = 1 / 240;
const CALM_FRAME = 31;
const KEY_STEP = 0.06;
/** One loop of the figure of eight at drift 1, seconds. */
const LOOP = 9;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

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

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** The cell's shape: rim, walls and floor, in units of one cell. */
const shapeOf = (rim: number, bevel: number, depth: number) => {
  const top = 0.5 - (0.015 + 0.09 * clamp(rim, 0, 1));
  const floor = Math.max(0.06, top - (0.05 + 0.26 * clamp(bevel, 0, 1)));
  return { top, floor, depth: 0.04 + 0.4 * clamp(depth, 0, 1) };
};

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_cell;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_lamp;
uniform vec3 u_lampPos;
uniform float u_lampRest;
uniform float u_top;
uniform float u_floor;
uniform float u_depth;
uniform float u_boss;
uniform float u_cam;
uniform float u_intensity;
uniform float u_ring;
in vec2 v_uv;
out vec4 outColor;

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

const vec2 N0 = vec2(1.0, 0.0);
const vec2 N1 = vec2(0.5, 0.8660254);
const vec2 N2 = vec2(-0.5, 0.8660254);

/** How far a point is from the cell's centre, in apothems: the hexagon's own distance. */
float hexd(vec2 q) {
  return max(abs(dot(q, N0)), max(abs(dot(q, N1)), abs(dot(q, N2))));
}

/** The nearest cell centre to a point, on a pointy-top lattice of unit spacing. */
vec2 cellOf(vec2 uv) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  return uv - g;
}

/** How much of the lamp reaches a point at depth z in the cell at o: does its ray leave through the opening? */
float reach(vec3 P, vec2 o, float pen) {
  if (P.z <= 0.0) return 1.0;
  float t = P.z / (P.z + u_lampPos.z);
  vec2 q = P.xy + t * (u_lampPos.xy - P.xy) - o;
  float s = pen * t + 0.004;
  return smoothstep(u_top + s, u_top - s, hexd(q));
}

void main() {
  vec2 frag = v_uv * u_size;
  vec2 uv = frag / u_cell;
  vec2 c = 0.5 * u_size / u_cell;
  vec2 o = cellOf(uv);
  vec2 q0 = uv - o;
  // The view ray drifts outward as it goes deeper: perspective from below.
  vec2 D = (uv - c) / u_cam;
  float slope = u_depth / max(u_top - u_floor, 1e-3);

  vec3 P;
  vec3 N;
  float kind;
  float ao = 1.0;
  if (hexd(q0) > u_top) {
    P = vec3(uv, 0.0);
    N = vec3(0.0, 0.0, -1.0);
    kind = 0.0;
  } else {
    float zHit = 1e9;
    vec2 nHit = N0;
    vec2 ns[6] = vec2[6](N0, N1, N2, -N0, -N1, -N2);
    for (int k = 0; k < 6; k++) {
      vec2 n = ns[k];
      float den = dot(D, n) + (u_top - u_floor) / u_depth;
      if (den <= 1e-5) continue;
      float z = (u_top - dot(q0, n)) / den;
      if (z < zHit) {
        zHit = z;
        nHit = n;
      }
    }
    if (zHit < u_depth) {
      P = vec3(uv + D * zHit, zHit);
      N = normalize(vec3(-slope * nHit, -1.0));
      kind = 1.0;
      // Walls darken toward the crease with the floor.
      ao = mix(1.0, 0.72, smoothstep(0.0, 1.0, zHit / u_depth));
    } else {
      P = vec3(uv + D * u_depth, u_depth);
      N = vec3(0.0, 0.0, -1.0);
      kind = 2.0;
      vec2 qf = P.xy - o;
      float edge = u_floor - hexd(qf);
      ao = mix(0.62, 1.0, smoothstep(0.0, 0.09, edge));
      // The boss: a low dome at the centre of the floor.
      float br = 0.1 * u_boss;
      float rb = length(qf);
      if (rb < br) {
        float zb = sqrt(br * br - rb * rb);
        N = normalize(vec3(qf, -zb));
        P.z = u_depth - zb * 0.6;
        kind = 3.0;
        ao = 1.0;
      }
    }
  }

  vec3 Lv = u_lampPos * vec3(1.0, 1.0, -1.0) - P;
  float dist2 = dot(Lv, Lv);
  vec3 Ld = Lv * inversesqrt(dist2);
  float diffuse = max(dot(N, Ld), 0.0);
  // Soft inverse-square, normalised to the lamp at its resting height: a lowered lamp flares.
  float K = 2.4;
  float fall = (1.0 + u_lampRest * u_lampRest / (K * K)) / (1.0 + dist2 / (K * K));
  float shadow = kind > 0.5 ? reach(P, o, 0.05) : 1.0;
  float direct = diffuse * fall * shadow * u_intensity;

  vec3 bg = lin(u_bg);
  vec3 fg = lin(u_fg);
  vec3 lamp = lin(u_lamp);
  vec3 plaster = u_light > 0.5 ? mix(bg, fg, 0.06) : mix(bg, fg, 0.16);
  float ambient = u_light > 0.5 ? 0.62 : 0.05;
  vec3 col = plaster * (ambient * ao + lamp * direct * (u_light > 0.5 ? 0.75 : 1.35));
  // The arris between rim and wall catches the lamp as a fine line.
  if (kind < 0.5) {
    float lip = smoothstep(0.012, 0.0, hexd(q0) - u_top);
    col += plaster * lamp * lip * diffuse * fall * 0.25;
  }
  col = u_light > 0.5 ? 1.0 - exp(-col * 1.9) : 1.0 - exp(-col * 1.5);

  // The lamp itself: a small orb hanging below the vault.
  vec2 ls = c + (u_lampPos.xy - c) * u_cam / (u_cam - u_lampPos.z);
  float ld = length(uv - ls);
  float orb = exp(-ld * ld / 0.0016);
  float halo = exp(-ld / 0.22) * 0.35;
  float ring = u_ring * smoothstep(0.012, 0.0, abs(ld - 0.16));
  if (u_light > 0.5) {
    col = mix(col, lamp, halo * 0.5);
    col = mix(col, vec3(1.0), orb);
    col = mix(col, fg, ring * 0.8);
  } else {
    col += lamp * (orb * 1.5 + halo * 0.6);
    col = mix(col, vec3(1.0), ring * 0.7);
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
  cellSize: number;
  depth: number;
  lampWarmth: number;
  lampHeight: number;
  press: number;
  bevel: number;
  rim: number;
  boss: boolean;
  intensity: number;
  drift: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  onCarry: (carried: boolean) => void;
};

type Source = "pointer" | "key";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** The hand over the vault, px in the box, or away. */
  handTo: (x: number, y: number, source: Source) => void;
  /** Moves the keyboard's lamp by a share of the box. */
  nudge: (dx: number, dy: number) => void;
  handAway: (source: Source) => void;
  lower: (down: boolean) => void;
  ring: (on: boolean) => void;
  dispose: () => void;
};

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
  const colours = new Float32Array(12);
  const lampRgb = new Float32Array(3);
  const size = { w: 0, h: 0 };
  const sim = { t: 0 };
  /** The lamp on screen (px) and its depth below the vault (0 rest → 1 lowered), each on the glide constants. */
  const lx = { x: Number.NaN, v: 0, target: 0 };
  const ly = { x: Number.NaN, v: 0, target: 0 };
  const low = { x: 0, v: 0, target: 0 };
  const hand = { present: false, source: null as Source | null, x: 0, y: 0 };
  let ringOn = 0;
  let carried = false;
  /** Tells the host when a hand takes the lamp or gives it back, from the move that did it. */
  const carry = () => {
    if (carried === hand.present) return;
    carried = hand.present;
    cfg?.onCarry(carried);
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

  const releaseGpu = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
  };

  const cellPx = () => clamp(cfg?.cellSize ?? 56, 24, 96);
  /** The camera's distance below the vault, in cells. */
  const camCells = () => (1.35 * Math.max(size.w, size.h)) / cellPx();
  /** The lamp's resting height below the vault, in cells. */
  const restCells = () => 0.6 + 2.4 * clamp(cfg?.lampHeight ?? 0.5, 0, 1);

  /** Where the figure of eight puts the lamp now, px. */
  const eight = () => {
    const w = size.w;
    const h = size.h;
    const a = (sim.t / LOOP) * Math.PI * 2;
    return {
      x: w / 2 + w * 0.3 * Math.sin(a),
      y: h * 0.48 + h * 0.26 * Math.sin(2 * a),
    };
  };

  const aim = () => {
    const c = cfg;
    if (!c) return;
    const e = eight();
    if (hand.present && c.interactive) {
      const k = hand.source === "key" ? 1 : clamp(c.pointerStrength, 0, 1);
      lx.target = e.x + (hand.x - e.x) * k;
      ly.target = e.y + (hand.y - e.y) * k;
    } else {
      lx.target = e.x;
      ly.target = e.y;
    }
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const shape = shapeOf(c.rim, c.bevel, c.depth);
    const k = clamp(c.lampWarmth, 0, 1);
    for (let i = 0; i < 3; i += 1) {
      lampRgb[i] =
        (colours[6 + i] ?? 0) +
        ((colours[9 + i] ?? 0) - (colours[6 + i] ?? 0)) * k;
    }
    p.program.set({
      u_size: [size.w, size.h],
      u_cell: cellPx(),
      u_light: light,
      u_bg: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_fg: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_lamp: [lampRgb[0] ?? 0, lampRgb[1] ?? 0, lampRgb[2] ?? 0],
      u_lampRest: restCells(),
      u_top: shape.top,
      u_floor: shape.floor,
      u_depth: shape.depth,
      u_boss: c.boss ? 1 : 0,
      u_cam: camCells(),
      u_intensity: clamp(c.intensity, 0, 1.5),
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    if (Number.isNaN(lx.x)) {
      aim();
      lx.x = lx.target;
      ly.x = ly.target;
    }
    const cell = cellPx();
    const cam = camCells();
    const depth =
      restCells() * (1 - 0.82 * clamp(c.press, 0, 1) * clamp(low.x, 0, 1.1));
    // The lamp is under the pointer on screen; in the vault's own units it sits a little nearer the centre.
    const cx = size.w / 2 / cell;
    const cy = size.h / 2 / cell;
    const sx = lx.x / cell;
    const sy = ly.x / cell;
    const k = (cam - depth) / cam;
    program.set({
      u_lampPos: [cx + (sx - cx) * k, cy + (sy - cy) * k, depth],
      u_ring: ringOn,
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const drifting = !c.paused && c.drift > 0;
    if (drifting) {
      sim.t += dt * (0.25 + 1.5 * clamp(c.drift, 0, 1));
      moving = true;
    }
    aim();
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const k = springs.glide;
    for (let i = 0; i < steps; i += 1) {
      for (const s of [lx, ly, low]) {
        s.v +=
          ((k.stiffness * (s.target - s.x) - k.damping * s.v) / k.mass) * h;
        s.x += s.v * h;
      }
    }
    for (const [s, eps] of [
      [lx, 0.1],
      [ly, 0.1],
      [low, 0.001],
    ] as const) {
      if (Math.abs(s.target - s.x) < eps && Math.abs(s.v) < eps * 10) {
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
    // Only the figure of eight moving: thirty frames a second is plenty.
    const calm = !hand.present && low.v === 0 && low.x === low.target;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the lamp stands at the hand, or at the vault's upper middle, and nothing drifts. */
  const place = () => {
    if (!hand.present || !cfg?.interactive) {
      lx.target = size.w / 2;
      ly.target = size.h * 0.4;
    } else {
      lx.target = hand.x;
      ly.target = hand.y;
    }
    for (const s of [lx, ly, low]) {
      s.x = s.target;
      s.v = 0;
    }
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
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
    // A dense screen can drop a quarter of its pixels; a plain one keeps them all.
    const ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    resizeGL(p.gl, canvas, {
      dprCap: clamp(c.dpr, 0.5, 2),
      renderScale: ratio >= 1.5 ? RENDER_SCALE : 1,
    });
    if (!c.motionSafe) place();
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

  const settleOrKick = () => {
    if (!cfg?.motionSafe) {
      place();
      draw();
      return;
    }
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2: the SVG still stays, and nothing retries.
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
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        carry();
      }
      if (!next.motionSafe) place();
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
      hand.present = true;
      hand.source = source;
      hand.x = clamp(x, 0, size.w);
      hand.y = clamp(y, 0, size.h);
      carry();
      settleOrKick();
    },
    nudge(dx, dy) {
      if (!hand.present || hand.source !== "key") {
        hand.x = Number.isNaN(lx.x) ? size.w / 2 : lx.x;
        hand.y = Number.isNaN(ly.x) ? size.h / 2 : ly.x;
      }
      hand.present = true;
      hand.source = "key";
      hand.x = clamp(hand.x + dx * size.w, 0, size.w);
      hand.y = clamp(hand.y + dy * size.h, 0, size.h);
      carry();
      settleOrKick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      carry();
      settleOrKick();
    },
    lower(down) {
      low.target = down ? 1 : 0;
      settleOrKick();
    },
    ring(on) {
      ringOn = on ? 1 : 0;
      draw();
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
 * A vault of recessed hexagonal coffers seen from below in true
 * perspective, lit by a lamp you carry. Each coffer is a convex well — a
 * flat ridge, six bevelled walls, a floor with a small boss — and every
 * pixel's view ray is intersected with its well exactly, so coffers away
 * from the middle show their outer walls as real ones do. Every surface is
 * lit by the lamp with a soft inverse square and shadowed exactly: a point
 * is lit only if its ray to the lamp leaves the well through its opening,
 * so as the lamp moves every lit wall and every shadow swings together,
 * like the sun crossing a dome.
 *
 * The lamp follows the pointer on the glide spring; without a hand it
 * drifts on a slow figure of eight. A press lowers it into the vault on the
 * same spring: the nearest cells flare and the far ones fall dark. The
 * keyboard's way in is a transparent button behind the content: arrow keys
 * carry the lamp, Space or Enter held lowers it. One fullscreen WebGL2
 * pass; under reduced motion the lamp stands still and moves only when the
 * hand does.
 */
export function HexCoffers({
  children,
  cellSize = 56,
  depth = 0.5,
  lampWarmth = 0.6,
  lampHeight = 0.5,
  press = 0.7,
  bevel = 0.45,
  rim = 0.14,
  boss = true,
  intensity = 1,
  drift = 0.5,
  interactive = true,
  pointerStrength = 1,
  paused = false,
  dpr = 2,
  label = "Coffered ceiling",
  onPressChange,
  onCarryChange,
  disabled = false,
  className,
}: HexCoffersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      "oklch(from var(--accent-bright) 0.93 0.03 h)",
      "oklch(from var(--warn) 0.84 calc(c * 1.05) h)",
    ],
    [],
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const pressed = React.useRef<Source | null>(null);
  const lastKey = React.useRef(0);
  const tapTimer = React.useRef<number | null>(null);
  const unlisten = React.useRef<(() => void) | null>(null);
  const report = React.useRef(onPressChange);
  const reportCarry = React.useRef(onCarryChange);

  const config: Config = {
    colorKey: paints.join("|"),
    cellSize,
    depth,
    lampWarmth,
    lampHeight,
    press,
    bevel,
    rim,
    boss,
    intensity,
    drift,
    interactive,
    pointerStrength,
    paused,
    dpr,
    motionSafe,
    onCarry: (c) => reportCarry.current?.(c),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onPressChange;
    reportCarry.current = onCarryChange;
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
    if (visible.current) e.wake();
    const tap = tapTimer;
    const listening = unlisten;
    return () => {
      if (tap.current !== null) window.clearTimeout(tap.current);
      tap.current = null;
      listening.current?.();
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

  const live = interactive && !disabled;

  const lowerBy = (source: Source) => {
    if (pressed.current) return;
    pressed.current = source;
    engine.current?.lower(true);
    report.current?.(true);
    setSaid((s) => ({ n: s.n + 1, text: "Lamp lowered." }));
  };

  const liftBy = (source: Source) => {
    if (pressed.current !== source) return;
    pressed.current = null;
    engine.current?.lower(false);
    report.current?.(false);
  };

  // A disabled vault lets go of its lamp.
  React.useEffect(() => {
    if (!disabled) return;
    const was = pressed.current;
    pressed.current = null;
    engine.current?.lower(false);
    engine.current?.handAway("pointer");
    engine.current?.handAway("key");
    if (was) report.current?.(false);
  }, [disabled]);

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
    if (!live) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && hit !== surfaceRef.current && rootRef.current?.contains(hit))
      return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    lowerBy("pointer");
    unlisten.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      liftBy("pointer");
      if (e.pointerType === "touch") engine.current?.handAway("pointer");
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    unlisten.current = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      unlisten.current = null;
    };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const by = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      lastKey.current = event.timeStamp;
      engine.current?.nudge(move[0], move[1]);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      lastKey.current = event.timeStamp;
      if (event.repeat) return;
      engine.current?.nudge(0, 0);
      lowerBy("key");
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    lastKey.current = event.timeStamp;
    liftBy("key");
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (!live || !event.currentTarget.matches(":focus-visible")) return;
    engine.current?.nudge(0, 0);
    engine.current?.ring(true);
  };

  const onBlur = () => {
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    tapTimer.current = null;
    liftBy("key");
    engine.current?.ring(false);
    engine.current?.handAway("key");
  };

  // A click with no pointer and no key behind it — assistive technology —
  // lowers the lamp for a moment, the same as a tap.
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || !live) return;
    if (event.timeStamp - lastKey.current < 500) return;
    engine.current?.nudge(0, 0);
    lowerBy("key");
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = null;
      liftBy("key");
    }, 600);
  };

  const still = React.useMemo(
    () => standIn(cellSize, rim, bevel, uid),
    [cellSize, rim, bevel, uid],
  );

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.handAway("pointer");
      }}
      className={cn(
        "group/hex-coffers relative isolate h-full w-full overflow-clip",
        // The lamp is carried in any direction on touch; a disabled vault gives the page its scroll back.
        live ? "touch-none" : "touch-auto",
        className,
      )}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full group-data-live/hex-coffers:hidden"
      >
        <defs>
          <pattern
            id={still.id}
            width={still.w}
            height={still.h}
            patternUnits="userSpaceOnUse"
          >
            <rect
              width={still.w}
              height={still.h}
              style={{ fill: still.rimFill }}
            />
            {still.polys.map((p, i) => (
              <polygon key={i} points={p.points} style={{ fill: p.fill }} />
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${still.id})`} />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
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
      <button
        ref={surfaceRef}
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        Move over the ceiling to carry the lamp; press to lower it into the
        vault. Arrow keys carry it, Space or Enter held lowers it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: one coffer tile as an SVG pattern, its six walls
 * shaded as if the lamp hung up and to the left.
 */
function standIn(cellSize: number, rim: number, bevel: number, uid: string) {
  const s = clamp(cellSize, 24, 96);
  const shape = shapeOf(rim, bevel, 0.5);
  const w = s;
  const h = s * Math.sqrt(3);
  // Pointy-top hexagons on the lattice: corners of the tile and its middle.
  const centres = [
    [0, 0],
    [w, 0],
    [w / 2, h / 2],
    [0, h],
    [w, h],
  ];
  const corner = (cx: number, cy: number, apothem: number, k: number) => {
    const a = ((k * 60 + 30) * Math.PI) / 180;
    const r = (apothem * s) / Math.cos(Math.PI / 6);
    return `${r3(cx + r * Math.cos(a))},${r3(cy + r * Math.sin(a))}`;
  };
  // Lit faces nearer the paper on a light page, nearer the ink on a dark one.
  const tone = (t: number) =>
    `light-dark(color-mix(in oklab, var(--background) ${Math.round(78 + 20 * t)}%, var(--foreground)), color-mix(in oklab, var(--background) ${Math.round(90 - 22 * t)}%, var(--foreground)))`;
  const polys: { points: string; fill: string }[] = [];
  for (const [cx = 0, cy = 0] of centres) {
    for (let k = 0; k < 6; k += 1) {
      // Wall k lies between corners k and k+1; its outward normal is at k·60 + 60°.
      const n = ((k * 60 + 60) * Math.PI) / 180;
      const lit = 0.5 + 0.5 * (Math.cos(n) * 0.6 + Math.sin(n) * 0.8);
      polys.push({
        points: [
          corner(cx, cy, shape.top, k),
          corner(cx, cy, shape.top, k + 1),
          corner(cx, cy, shape.floor, k + 1),
          corner(cx, cy, shape.floor, k),
        ].join(" "),
        fill: tone(lit),
      });
    }
    polys.push({
      points: Array.from({ length: 6 }, (_, k) =>
        corner(cx, cy, shape.floor, k),
      ).join(" "),
      fill: tone(0.55),
    });
  }
  return {
    id: `hc${uid.replace(/[^a-zA-Z0-9]/g, "")}`,
    w: r3(w),
    h: r3(h),
    polys,
    rimFill: tone(0.85),
  };
}
