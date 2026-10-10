"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type UniformValue,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HaloRingsPalette = "tide" | "dusk" | "ember" | "mono";

export type HaloRingsProps = {
  /** Rings sent per second while the pointer is in; three quarters of that at rest. @default 1.2 */
  pulse?: number;
  /** A new ring's width in px; it thins to a third as it spreads. @default 8 */
  width?: number;
  /** A named palette, or two CSS colours a ring travels between as it ages. @default "tide" */
  colors?: HaloRingsPalette | readonly string[];
  /** How fast a ring spreads, in px per second. @default 120 */
  speed?: number;
  /** How far a ring travels before it has faded out, in px (never past the box's diagonal). @default 300 */
  reach?: number;
  /** How far the source trails the pointer, 0 (springs.glide) to 1 (springs.drift). @default 0.5 */
  lag?: number;
  /** From plain glowing rings (0) to wave packets whose crests add and cancel where they cross (1). @default 0.6 */
  interference?: number;
  /** How bright the rings are, 0 to 1. @default 0.7 */
  intensity?: number;
  /** Where the source rests with nobody pointing, as [x, y] fractions of the box. @default [0.5, 0.5] */
  origin?: readonly [number, number];
  /** Keep pulsing slowly from `origin` while nobody points. @default true */
  ambient?: boolean;
  /** Follow the pointer and keyboard focus; a press sends a bright ring. @default true */
  interactive?: boolean;
  /** Draw the rings under the content or over it. @default "under" */
  layer?: "under" | "over";
  /** Freeze the rings where they are. @default false */
  paused?: boolean;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a press or a keyboard activation sends a bright ring, with its point in the box. */
  onRing?: (point: { x: number; y: number }) => void;
  /** Classes for the box; size it here. */
  className?: string;
  /** Content over (or under) the rings; it keeps every click, focus and key. */
  children?: React.ReactNode;
};

const PALETTES: Record<HaloRingsPalette, readonly [string, string]> = {
  tide: ["var(--accent-bright)", "var(--signal)"],
  dusk: [
    "oklch(from var(--accent-bright) l c 300)",
    "oklch(from var(--danger) 0.68 c h)",
  ],
  ember: [
    "oklch(from var(--warn) 0.76 c h)",
    "oklch(from var(--danger) 0.64 c h)",
  ],
  mono: ["var(--foreground)", "var(--ink-3)"],
};

const MAX_RINGS = 24;
const STILL_RINGS = 6;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_rings[${MAX_RINGS}];
uniform vec4 u_meta[${MAX_RINGS}];
uniform int u_count;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform float u_interference;
uniform float u_intensity;
uniform float u_dark;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 p = v_uv * u_res;
  float field = 0.0;
  float glow = 0.0;
  float weight = 0.0;
  vec3 tint = vec3(0.0);
  for (int i = 0; i < ${MAX_RINGS}; i += 1) {
    if (i >= u_count) break;
    vec4 ring = u_rings[i];
    vec4 meta = u_meta[i];
    float x = (length(p - ring.xy) - ring.z) / max(meta.y, 0.5);
    if (abs(x) > 6.0) continue;
    // A short wave packet: a gaussian envelope on a carrier. Summed as
    // waves and squared, crossing packets add and cancel into a lattice;
    // a ring alone reads as a halo with a couple of faint inner lines.
    float env = exp(-x * x);
    float halo = exp(-x * x * 0.12) * 0.22;
    field += ring.w * env * cos(x * 4.2);
    glow += ring.w * (env + halo);
    vec3 c = mix(u_c0, u_c1, meta.x);
    float wgt = ring.w * (env + halo);
    tint += c * wgt;
    weight += wgt;
  }
  float energy = mix(glow, field * field + glow * 0.18, u_interference);
  energy *= u_intensity;
  vec3 colour = weight > 0.0001 ? tint / weight : u_c0;
  // On a dark page the hottest crossings burn toward white.
  colour = mix(colour, vec3(1.0), smoothstep(1.1, 2.6, energy) * 0.45 * u_dark);
  float alpha = clamp(1.0 - exp(-energy * 1.5), 0.0, 0.94);
  o_color = vec4(colour * alpha, alpha);
}
`;

type Ring = {
  x: number;
  y: number;
  age: number;
  bright: boolean;
  live: boolean;
};

type Rgb = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

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

/** A ring's look at a given age: radius, fade, width and colour position. */
function ringState(
  age: number,
  bright: boolean,
  speed: number,
  reach: number,
  width: number,
) {
  const radius = age * speed * (bright ? 1.3 : 1);
  const life = clamp(radius / reach, 0, 1);
  // A gentle fall-off that still lands on nothing exactly at `reach`.
  const fade = Math.pow(1 - life, bright ? 1.1 : 1.35);
  // Born over 80ms, so a new ring never pops into being.
  const born = clamp(age / 0.08, 0, 1);
  return {
    radius,
    life,
    strength: fade * born * (bright ? 1.8 : 1),
    width: width * lerp(1, 0.4, life) * (bright ? 1.5 : 1),
  };
}

/**
 * Rings of light ripple out from a source that trails the pointer, drawn in
 * one WebGL2 pass behind the content. Every `1 / pulse` seconds the source
 * sends a ring that spreads, thins and fades; each ring is a short wave
 * packet, and the packets are summed as waves, so where offset rings cross
 * their crests add and cancel into a fine lattice. The source follows the
 * pointer on a damped spring between springs.glide and springs.drift, so a
 * sweep leaves a wake of crossing rings; a press sends a bright ring from the
 * press point that cuts through the rest. With nobody pointing it rests at
 * `origin` and pulses at three quarters of the rate.
 *
 * Keyboard focus on a control inside moves the source to it and Enter or
 * Space on it sends the bright ring. Without WebGL2, or after a lost context,
 * the rings are stroked on a 2D canvas. Under reduced motion it is one still
 * ripple, and a press re-centres the still instantly.
 */
export function HaloRings({
  pulse = 1.2,
  width = 8,
  colors = "tide",
  speed = 120,
  reach = 300,
  lag = 0.5,
  interference = 0.6,
  intensity = 0.7,
  origin = [0.5, 0.5],
  ambient = true,
  interactive = true,
  layer = "under",
  paused = false,
  dpr = 2,
  onRing,
  className,
  children,
}: HaloRingsProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  // After a lost context the canvas is replaced and drawn in 2D from then on.
  const [flat, setFlat] = React.useState(false);
  const api = React.useRef<{
    recolour: () => void;
    wake: () => void;
  } | null>(null);

  const palette =
    typeof colors === "string"
      ? (PALETTES[colors as HaloRingsPalette] ?? PALETTES.tide)
      : [
          colors[0] ?? PALETTES.tide[0],
          colors[1] ?? colors[0] ?? PALETTES.tide[1],
        ];
  const c0 = palette[0];
  const c1 = palette[1];
  const ox = clamp(origin[0], 0, 1);
  const oy = clamp(origin[1], 0, 1);

  const params = React.useRef({
    pulse,
    width,
    speed,
    reach,
    lag,
    interference,
    intensity,
    ox,
    oy,
    ambient,
    interactive,
    paused,
    dpr,
    motionSafe,
    onRing,
    c0,
    c1,
  });
  React.useEffect(() => {
    params.current = {
      pulse,
      width,
      speed,
      reach,
      lag,
      interference,
      intensity,
      ox,
      oy,
      ambient,
      interactive,
      paused,
      dpr,
      motionSafe,
      onRing,
      c0,
      c1,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    // WebGL2 first; a canvas that never took a GL context can still draw 2D.
    const gl = flat ? null : createGL(canvas, { alpha: true });
    const program = gl ? createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT) : null;
    const tri = gl && program ? createFullscreenTriangle(gl, program) : null;
    const ctx = tri ? null : canvas.getContext("2d");
    if (!tri && !ctx) return;
    if (gl) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
    }

    const rings: Ring[] = Array.from({ length: MAX_RINGS }, () => ({
      x: 0,
      y: 0,
      age: 0,
      bright: false,
      live: false,
    }));
    const packed = new Float32Array(MAX_RINGS * 4);
    const meta = new Float32Array(MAX_RINGS * 4);
    // Everything the shader reads lives in arrays made once and filled in
    // place, so a frame allocates nothing.
    const res = new Float32Array(2);
    const tint0 = new Float32Array(3);
    const tint1 = new Float32Array(3);
    const uniforms: Record<string, UniformValue> = {
      u_res: res,
      u_rings: packed,
      u_meta: meta,
      u_count: 0,
      u_c0: tint0,
      u_c1: tint1,
      u_interference: 0,
      u_intensity: 0,
      u_dark: 1,
    };
    const blend = { stiffness: 0, damping: 0, mass: 1 };
    let cursor = 0;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let phase = 0.85;
    let inView = true;
    let lost = false;
    let shown = false;
    let readyFrame = 0;
    let colour0: Rgb = [0.3, 0.5, 1];
    let colour1: Rgb = [0.3, 0.9, 0.7];
    let dark = 1;
    const source = { x: 0, y: 0, vx: 0, vy: 0, placed: false };
    const pointer = { x: 0, y: 0, inside: false };
    let focused: HTMLElement | null = null;
    // Reduced motion draws a still ripple around this point.
    const still = { x: -1, y: -1 };

    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const rgb = (css: string): Rgb => {
      const probe = probeRef.current;
      if (!probe || !reader) return [0.5, 0.5, 0.5];
      probe.style.color = css;
      reader.clearRect(0, 0, 1, 1);
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = getComputedStyle(probe).color;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return [(d[0] ?? 128) / 255, (d[1] ?? 128) / 255, (d[2] ?? 128) / 255];
    };
    const recolour = () => {
      const p = params.current;
      colour0 = rgb(p.c0);
      colour1 = rgb(p.c1);
      tint0.set(colour0);
      tint1.set(colour1);
      const bg = rgb("var(--background)");
      dark = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] < 0.5 ? 1 : 0;
    };

    const reachOf = () =>
      Math.max(40, Math.min(params.current.reach, Math.hypot(w, h)));

    const emit = (x: number, y: number, bright: boolean) => {
      const ring = rings[cursor];
      cursor = (cursor + 1) % MAX_RINGS;
      if (!ring) return;
      ring.x = x;
      ring.y = y;
      ring.age = 0;
      ring.bright = bright;
      ring.live = true;
    };

    const home = () => {
      const p = params.current;
      return { x: p.ox * w, y: p.oy * h };
    };

    /** Pack the live rings for the shader (or the 2D stroker). */
    const pack = () => {
      const p = params.current;
      const far = reachOf();
      let n = 0;
      for (const ring of rings) {
        if (!ring.live) continue;
        const s = ringState(ring.age, ring.bright, p.speed, far, p.width);
        if (s.life >= 1) {
          ring.live = false;
          continue;
        }
        packed[n * 4] = ring.x;
        packed[n * 4 + 1] = ring.y;
        packed[n * 4 + 2] = s.radius;
        packed[n * 4 + 3] = s.strength;
        meta[n * 4] = ring.bright ? 0 : s.life;
        meta[n * 4 + 1] = s.width;
        meta[n * 4 + 2] = ring.bright ? 1 : 0;
        meta[n * 4 + 3] = 0;
        n += 1;
      }
      return n;
    };

    /** The reduced-motion ripple: nested rings frozen mid-spread. */
    const packStill = () => {
      const p = params.current;
      const far = reachOf();
      const centre = still.x < 0 ? home() : still;
      const spacing = p.speed / Math.max(0.2, p.pulse);
      let n = 0;
      for (let k = 0; k < STILL_RINGS; k += 1) {
        const radius = (k + 0.4) * Math.min(spacing, far / STILL_RINGS);
        const s = ringState(radius / p.speed, false, p.speed, far, p.width);
        if (s.life >= 1) break;
        packed[n * 4] = centre.x;
        packed[n * 4 + 1] = centre.y;
        packed[n * 4 + 2] = s.radius;
        packed[n * 4 + 3] = s.strength;
        meta[n * 4] = s.life;
        meta[n * 4 + 1] = s.width;
        meta[n * 4 + 2] = 0;
        meta[n * 4 + 3] = 0;
        n += 1;
      }
      return n;
    };

    const draw = () => {
      if (lost || w < 1 || h < 1) return;
      const p = params.current;
      const n = p.motionSafe ? pack() : packStill();
      if (gl && program && tri) {
        if (gl.isContextLost()) return;
        resizeGL(gl, canvas, { dprCap: Math.min(2, Math.max(1, p.dpr)) });
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        program.use();
        res[0] = w;
        res[1] = h;
        uniforms.u_count = n;
        uniforms.u_interference = clamp(p.interference, 0, 1);
        uniforms.u_intensity = clamp(p.intensity, 0, 1) * 1.4;
        uniforms.u_dark = dark;
        program.set(uniforms);
        tri.draw();
      } else if (ctx) {
        const ratio = Math.min(
          2,
          Math.max(1, p.dpr),
          window.devicePixelRatio || 1,
        );
        const bw = Math.max(1, Math.round(w * ratio));
        const bh = Math.max(1, Math.round(h * ratio));
        if (canvas.width !== bw || canvas.height !== bh) {
          canvas.width = bw;
          canvas.height = bh;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const k = clamp(p.intensity, 0, 1);
        for (let i = 0; i < n; i += 1) {
          const life = meta[i * 4] ?? 0;
          const cr = Math.round(lerp(colour0[0], colour1[0], life) * 255);
          const cg = Math.round(lerp(colour0[1], colour1[1], life) * 255);
          const cb = Math.round(lerp(colour0[2], colour1[2], life) * 255);
          const a = clamp((packed[i * 4 + 3] ?? 0) * k, 0, 1);
          ctx.beginPath();
          ctx.arc(
            packed[i * 4] ?? 0,
            packed[i * 4 + 1] ?? 0,
            Math.max(0, packed[i * 4 + 2] ?? 0),
            0,
            Math.PI * 2,
          );
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${r2(a * 0.18)})`;
          ctx.lineWidth = (meta[i * 4 + 1] ?? 1) * 2.6;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${r2(a * 0.8)})`;
          ctx.lineWidth = Math.max(1, (meta[i * 4 + 1] ?? 1) * 0.7);
          ctx.stroke();
        }
      }
      if (!shown) {
        shown = true;
        readyFrame = requestAnimationFrame(() => setReady(true));
      }
    };

    const emitting = () => {
      const p = params.current;
      return (
        (p.interactive && (pointer.inside || focused !== null)) || p.ambient
      );
    };
    const anyLive = () => rings.some((ring) => ring.live);

    const step = (dt: number) => {
      const p = params.current;
      const active = p.interactive && (pointer.inside || focused !== null);
      let tx: number;
      let ty: number;
      if (active && focused && focused.isConnected) {
        const box = root.getBoundingClientRect();
        const r = focused.getBoundingClientRect();
        tx = r.left + r.width / 2 - box.left;
        ty = r.top + r.height / 2 - box.top;
      } else if (active && pointer.inside) {
        tx = pointer.x;
        ty = pointer.y;
      } else {
        ({ x: tx, y: ty } = home());
      }
      if (!source.placed) {
        source.x = tx;
        source.y = ty;
        source.placed = true;
      }
      // The source trails on a spring between glide and drift: the house
      // constants, blended by `lag`.
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
        source.vx = springStep(source.x, source.vx, tx, blend, dt / steps);
        source.x += (source.vx * dt) / steps;
        source.vy = springStep(source.y, source.vy, ty, blend, dt / steps);
        source.y += (source.vy * dt) / steps;
      }
      for (const ring of rings) if (ring.live) ring.age += dt;
      const rate = active ? p.pulse : p.ambient ? p.pulse * 0.75 : 0;
      if (rate > 0) {
        phase += dt * rate;
        if (phase >= 1) {
          phase -= Math.floor(phase);
          emit(source.x, source.y, false);
        }
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
        w > 0 &&
        (emitting() || anyLive())
      );
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      carry += dt;
      const p = params.current;
      // Resting, the ripple is slow: every other frame is plenty.
      const lively = p.interactive && (pointer.inside || focused !== null);
      if (lively || carry >= 1 / 32 || rings.some((r) => r.live && r.bright)) {
        step(carry);
        carry = 0;
        draw();
      }
      if (canRun()) raf = requestAnimationFrame(tick);
      else draw();
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

    const brightRing = (x: number, y: number) => {
      const p = params.current;
      if (!p.interactive || p.paused) return;
      if (!p.motionSafe) {
        // Reduced motion: the still ripple re-centres here, instantly.
        still.x = x;
        still.y = y;
        draw();
      } else {
        emit(x, y, true);
        wake();
      }
      p.onRing?.({ x: Math.round(x), y: Math.round(y) });
    };

    const onMove = (event: PointerEvent) => {
      if (!params.current.interactive) return;
      const pt = local(event.clientX, event.clientY);
      pointer.x = pt.x;
      pointer.y = pt.y;
      if (!pointer.inside) {
        pointer.inside = true;
        // The first ring follows the pointer in rather than waiting a beat.
        phase = Math.max(phase, 0.85);
      }
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
      brightRing(pt.x, pt.y);
    };
    // Enter or Space on a control inside: a click with no pointer behind it.
    const onClick = (event: MouseEvent) => {
      if (event.detail !== 0) return;
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      const r = el.getBoundingClientRect();
      const pt = local(r.left + r.width / 2, r.top + r.height / 2);
      brightRing(pt.x, pt.y);
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!el.matches(":focus-visible") || !params.current.interactive) return;
      focused = el;
      phase = Math.max(phase, 0.85);
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
    const detach = gl
      ? onContextLoss(canvas, () => {
          lost = true;
          halt();
          setReady(false);
          setFlat(true);
        })
      : () => {};

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
      tri?.dispose();
      program?.dispose();
      api.current = null;
    };
  }, [flat]);

  React.useEffect(() => {
    api.current?.recolour();
  }, [c0, c1]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    pulse,
    width,
    speed,
    reach,
    lag,
    interference,
    intensity,
    ox,
    oy,
    ambient,
    interactive,
    paused,
    motionSafe,
    dpr,
  ]);

  // The server and the first paint get a soft still of the ripple in CSS,
  // which the canvas replaces on its first frame.
  const stillRings = Array.from({ length: 4 }, (_, k) => {
    const radius = Math.round((k + 0.6) * 44);
    const alpha = Math.round(34 - k * 7);
    const band = Math.max(2, Math.round(width * 0.45));
    return `radial-gradient(circle at ${r2(ox * 100)}% ${r2(oy * 100)}%, transparent ${radius - band}px, color-mix(in oklab, ${k % 2 ? c1 : c0} ${alpha}%, transparent) ${radius}px, transparent ${radius + band}px)`;
  }).join(", ");

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
          background: stillRings,
          transitionDuration: `${Math.round(durations.slow * 1000)}ms`,
        }}
      />
      {/* One canvas whatever the layer: stacking, not DOM order, puts it
          over or under, so switching never tears down the context. */}
      <canvas
        key={flat ? "flat" : "gl"}
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 size-full",
          layer === "over" ? "z-20" : "z-0",
        )}
      />
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
