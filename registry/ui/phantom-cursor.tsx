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
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PhantomCursorShape = "arrow" | "orb";

export type PhantomCursorHandle = {
  /** Shows the phantom resting at [x, y] in the box's own pixels (its centre when omitted) until it dissolves; ignored while the visitor's pointer is inside. */
  appear: (x?: number, y?: number) => void;
};

export type PhantomCursorProps = {
  /** The surface the phantom haunts. It stays fully interactive; the phantom never takes a click. */
  children?: React.ReactNode;
  /** How far it lags the hand: 0 keeps close on the glide spring, 1 trails on a spring softer than drift. @default 0.6 */
  lag?: number;
  /** The phantom's height, in CSS pixels. @default 28 */
  size?: number;
  /** How much of it is smoke: 0 is a soft silhouette, 1 a loose, drifting wisp. @default 0.6 */
  smoke?: number;
  /** A shadow of the pointer's own arrow, or a round wisp. @default "arrow" */
  shape?: PhantomCursorShape;
  /** How far it smears behind itself along its travel, 0 to 1. @default 0.6 */
  stretch?: number;
  /** How much faster it closes in once the hand rests, 0 (never hurries) to 1 (five times stiffer). @default 0.6 */
  catchUp?: number;
  /** How long it lingers once it has caught up and the hand is still, in ms, before it dissolves; 0 never dissolves while the pointer is inside. @default 1400 */
  idle?: number;
  /** Where it rests relative to the pointer, as [x, y] in CSS pixels — a shadow falls below and to the right. @default [8, 10] */
  offset?: [number, number];
  /** Its colour, any CSS colour, resolved on the element: a shadow on paper, a pale ghost at night. @default "var(--ink)" */
  color?: string;
  /** Its peak opacity, 0 to 1. @default 0.45 */
  opacity?: number;
  /** Keyboard focus inside sends the phantom to the focused element. @default true */
  followFocus?: boolean;
  /** The pointer (mouse and pen) summons it. Touch gets the resting state: no phantom. @default true */
  interactive?: boolean;
  /** Holds the smoke's drift; the phantom still follows. @default false */
  paused?: boolean;
  /** Seed for the smoke. @default 3 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Classes for the box. */
  className?: string;
  /** Exposes `appear()`. */
  ref?: React.Ref<PhantomCursorHandle>;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec2 u_pos;
uniform vec2 u_vel;
uniform float u_size;
uniform float u_smoke;
uniform float u_stretch;
uniform float u_time;
uniform float u_seed;
uniform float u_shape;
uniform vec3 u_color;
uniform float u_alpha;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

// The pointer's arrow, tip at the origin, one unit tall.
float arrow(vec2 p) {
  vec2 v[7] = vec2[7](
    vec2(0.0, 0.0), vec2(0.0, 0.86), vec2(0.22, 0.66), vec2(0.36, 0.98),
    vec2(0.49, 0.92), vec2(0.35, 0.61), vec2(0.62, 0.61)
  );
  float d = dot(p - v[0], p - v[0]);
  float s = 1.0;
  int j = 6;
  for (int i = 0; i < 7; i += 1) {
    vec2 e = v[j] - v[i];
    vec2 w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
    j = i;
  }
  return s * sqrt(d);
}

float shape(vec2 p) {
  return u_shape < 0.5 ? arrow(p) : length(p - vec2(0.34, 0.4)) - 0.32;
}

void main() {
  vec2 px = vec2(v_uv.x, v_uv.y) * u_res;
  vec2 q = (px - u_pos) / u_size;
  vec2 c0 = u_shape < 0.5 ? vec2(0.24, 0.55) : vec2(0.34, 0.4);

  // The smear: everything behind the centroid, along the travel, is
  // sampled from closer in, so the form trails back into a wisp that
  // thins and fades the further behind it reaches.
  float speed = length(u_vel);
  float k = u_stretch * clamp(speed / 900.0, 0.0, 1.4) * 2.0;
  vec2 dir = speed > 1.0 ? u_vel / speed : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 r = q - c0;
  float along = dot(r, dir);
  float across = dot(r, nrm);
  float behind = clamp(-along / (0.6 + 0.6 * k), 0.0, 1.0);
  if (along < 0.0) along /= 1.0 + k;
  across *= 1.0 + 0.7 * k * behind;
  vec2 s = c0 + dir * along + nrm * across;

  // Smoke: a domain warp of two noise octaves drifting upward.
  float t = u_time;
  vec2 wq = s * 3.1 + vec2(u_seed * 1.7, u_seed * 0.9);
  vec2 warp = vec2(
    kx_noise(wq + vec2(0.0, t * 0.9)),
    kx_noise(wq * 1.9 + vec2(4.1, t * 1.3))
  ) - 0.5;
  s += warp * (0.04 + 0.3 * u_smoke + 0.12 * k);

  float d = shape(s);
  float soft = 0.025 + 0.12 * u_smoke + 0.1 * k;
  float density = 1.0 - smoothstep(-soft, soft, d);
  float wisp = kx_noise(s * 6.0 + vec2(u_seed - t * 0.3, t * 1.1));
  density *= mix(1.0, 0.4 + 0.85 * wisp, u_smoke * 0.85);
  density *= 1.0 - 0.55 * behind * min(k, 1.0);
  float alpha = clamp(density, 0.0, 1.0) * u_alpha;
  o_color = vec4(u_color * alpha, alpha);
}
`;

type Rgb = [number, number, number];

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The arrow for the DOM fallback, the same seven points as the shader's. */
const ARROW_PATH =
  "M0 0 L0 0.86 L0.22 0.66 L0.36 0.98 L0.49 0.92 L0.35 0.61 L0.62 0.61 Z";
/** The pointer has rested once it has not moved for this long. */
const REST_MS = 90;

/**
 * A shadow self that follows the pointer around its box: a soft form made of
 * smoke, shaped like the pointer's own arrow (or a round wisp), resting a
 * few pixels below and to the right of the real cursor like a cast shadow.
 *
 * It follows on a 2D spring that slides from springs.glide (lag 0) to one
 * softer than springs.drift (lag 1), so it dawdles behind a moving hand and
 * smears along its travel; when the hand rests the spring stiffens by up to
 * five times and it hurries in, condensing back into its shape as it
 * arrives. Once caught up and still for `idle` ms it dissolves, and the loop
 * stops; the next move brings it back where you are. One WebGL2 fragment
 * shader draws it — a polygon distance field sampled through a rising
 * two-octave noise warp — scissored to the phantom's own box; without
 * WebGL2, or after a lost context, a blurred DOM copy takes its place on the
 * same physics. Keyboard focus inside sends it to rest on the focused
 * element's corner. Under reduced motion it is a still, soft shadow exactly
 * at the pointer that fades in and out.
 */
export function PhantomCursor({
  children,
  lag = 0.6,
  size = 28,
  smoke = 0.6,
  shape = "arrow",
  stretch = 0.6,
  catchUp = 0.6,
  idle = 1400,
  offset = [8, 10],
  color = "var(--ink)",
  opacity = 0.45,
  followFocus = true,
  interactive = true,
  paused = false,
  seed = 3,
  dpr = 2,
  className,
  ref,
}: PhantomCursorProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const ghostRef = React.useRef<HTMLDivElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);

  const offsetX = offset[0];
  const offsetY = offset[1];
  const params = React.useRef({
    lag,
    size,
    smoke,
    shape,
    stretch,
    catchUp,
    idle,
    offsetX,
    offsetY,
    color,
    opacity,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      lag,
      size,
      smoke,
      shape,
      stretch,
      catchUp,
      idle,
      offsetX,
      offsetY,
      color,
      opacity,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
    };
  });

  const api = React.useRef<{
    point: (x: number, y: number) => void;
    focus: (x: number, y: number) => void;
    leave: () => void;
    appear: (x: number, y: number) => void;
    restyle: () => void;
    wake: () => void;
  } | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({
      appear: (x, y) => {
        const root = rootRef.current;
        if (!root) return;
        api.current?.appear(
          x ?? root.clientWidth / 2,
          y ?? root.clientHeight / 2,
        );
      },
    }),
    [],
  );

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ghost = ghostRef.current;
    if (!root || !canvas || !ghost) return;
    const read = rgbReader();

    let gl: GLContext | null = createGL(canvas, {
      alpha: true,
      premultipliedAlpha: true,
    });
    let program: Program | null = null;
    let tri: FullscreenTriangle | null = null;
    if (gl) {
      program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (program) tri = createFullscreenTriangle(gl, program);
    }
    // No WebGL2 (or no program): the DOM phantom carries the same physics.
    let fallback = !gl || !program || !tri;
    const detach = onContextLoss(canvas, () => {
      fallback = true;
      gl = null;
      wake();
    });

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let inView = false;
    let clock = 0;
    let cleared = true;
    // Uniform values, allocated once and rewritten each frame.
    const uRes = new Float32Array(2);
    const uPos = new Float32Array(2);
    const uVel = new Float32Array(2);
    const uColor = new Float32Array([0.1, 0.12, 0.16]);

    // The phantom: where it is, its velocity, where it is going.
    const ph = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
    let vis = 0;
    let wantVis = 0;
    let hurry = 0;
    let movedAt = -1e9;
    let mode: "away" | "pointer" | "focus" = "away";
    let idleTimer = 0;

    const restyle = () => {
      const probe = probeRef.current;
      if (!probe) return;
      probe.style.color = params.current.color;
      const c = read(getComputedStyle(probe).color);
      uColor[0] = c[0] / 255;
      uColor[1] = c[1] / 255;
      uColor[2] = c[2] / 255;
      ghost.style.color = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
    };

    const armIdle = (hold?: number) => {
      window.clearTimeout(idleTimer);
      const p = params.current;
      const ms = hold ?? p.idle;
      if (ms <= 0) return;
      idleTimer = window.setTimeout(checkIdle, Math.max(120, ms));
    };
    function checkIdle() {
      const caught =
        Math.hypot(ph.x - ph.tx, ph.y - ph.ty) < 1.5 &&
        Math.hypot(ph.vx, ph.vy) < 8;
      if (!caught) {
        idleTimer = window.setTimeout(checkIdle, 120);
        return;
      }
      wantVis = 0;
      wake();
    }

    const step = (dt: number, now: number) => {
      const p = params.current;
      if (!p.motionSafe) {
        ph.x = ph.tx;
        ph.y = ph.ty;
        ph.vx = 0;
        ph.vy = 0;
      } else {
        const t = clamp(p.lag, 0, 1);
        const resting = now - movedAt > REST_MS || mode === "focus";
        hurry += ((resting ? 1 : 0) - hurry) * (1 - Math.exp(-dt / 0.12));
        const k =
          springs.glide.stiffness *
          Math.pow(40 / springs.glide.stiffness, t) *
          (1 + 4 * clamp(p.catchUp, 0, 1) * hurry);
        const zeta = 0.98 - 0.12 * t;
        const c = 2 * zeta * Math.sqrt(k);
        let s = dt;
        while (s > 1e-6) {
          const d = Math.min(s, 1 / 120);
          ph.vx += (-k * (ph.x - ph.tx) - c * ph.vx) * d;
          ph.vy += (-k * (ph.y - ph.ty) - c * ph.vy) * d;
          ph.x += ph.vx * d;
          ph.y += ph.vy * d;
          s -= d;
        }
        if (!p.paused) clock += dt;
      }
      // Opacity is a tween either way: in quickly, out slowly.
      const tau = wantVis > vis ? 0.08 : 0.24;
      vis += (wantVis - vis) * (1 - Math.exp(-dt / tau));
      if (Math.abs(wantVis - vis) < 0.002) vis = wantVis;
    };

    const renderGL = () => {
      const p = params.current;
      if (!gl || !program || !tri) return;
      if (gl.isContextLost()) return;
      const box = resizeGL(gl, canvas, {
        dprCap: Math.min(2, Math.max(1, p.dpr)),
      });
      const ratio = box.dpr;
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (vis <= 0.002) {
        cleared = true;
        return;
      }
      cleared = false;
      const px = Math.max(8, p.size);
      const speed = Math.hypot(ph.vx, ph.vy);
      const ks =
        p.motionSafe && speed > 1
          ? clamp(p.stretch, 0, 1) * clamp(speed / 900, 0, 1.4) * 2
          : 0;
      // The scissor box: the form, its smoke, and the smear behind it.
      const pad = px * (0.25 + 0.35 * clamp(p.smoke, 0, 1)) + 4;
      let x0 = ph.x - pad;
      let y0 = ph.y - pad;
      let x1 = ph.x + px * 0.7 + pad;
      let y1 = ph.y + px * 1.05 + pad;
      if (ks > 0) {
        const back = px * 0.7 * ks;
        const dx = (-ph.vx / speed) * back;
        const dy = (-ph.vy / speed) * back;
        x0 = Math.min(x0, x0 + dx);
        x1 = Math.max(x1, x1 + dx);
        y0 = Math.min(y0, y0 + dy);
        y1 = Math.max(y1, y1 + dy);
      }
      x0 = clamp(x0, 0, w);
      x1 = clamp(x1, 0, w);
      y0 = clamp(y0, 0, h);
      y1 = clamp(y1, 0, h);
      if (x1 - x0 < 1 || y1 - y0 < 1) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(
        Math.floor(x0 * ratio),
        Math.floor((h - y1) * ratio),
        Math.ceil((x1 - x0) * ratio),
        Math.ceil((y1 - y0) * ratio),
      );
      uRes[0] = w;
      uRes[1] = h;
      uPos[0] = ph.x;
      uPos[1] = ph.y;
      uVel[0] = p.motionSafe ? ph.vx : 0;
      uVel[1] = p.motionSafe ? ph.vy : 0;
      program.use();
      program.set({
        u_res: uRes,
        u_pos: uPos,
        u_vel: uVel,
        u_size: px,
        u_smoke: clamp(p.smoke, 0, 1),
        u_stretch: p.motionSafe ? clamp(p.stretch, 0, 1) : 0,
        u_time: clock,
        u_seed: (p.seed % 97) * 1.37,
        u_shape: p.shape === "orb" ? 1 : 0,
        u_color: uColor,
        u_alpha: vis * clamp(p.opacity, 0, 1),
      });
      tri.draw();
      gl.disable(gl.SCISSOR_TEST);
    };

    const renderDom = () => {
      const p = params.current;
      if (vis <= 0.002) {
        ghost.style.opacity = "0";
        return;
      }
      const px = Math.max(8, p.size);
      const speed = Math.hypot(ph.vx, ph.vy);
      const ks =
        p.motionSafe && speed > 1
          ? clamp(p.stretch, 0, 1) * clamp(speed / 900, 0, 1.4)
          : 0;
      const angle = speed > 1 ? Math.atan2(ph.vy, ph.vx) : 0;
      // A smear along the travel, about the form's own middle.
      ghost.style.transform = `translate3d(${r2(ph.x)}px, ${r2(ph.y)}px, 0) rotate(${r3(angle)}rad) scaleX(${r3(1 + ks)}) rotate(${r3(-angle)}rad)`;
      ghost.style.width = `${r2(px)}px`;
      ghost.style.height = `${r2(px)}px`;
      ghost.style.filter = `blur(${r2(0.5 + clamp(p.smoke, 0, 1) * px * 0.12)}px)`;
      ghost.style.opacity = String(r3(vis * clamp(p.opacity, 0, 1)));
    };

    const render = () => {
      if (fallback) {
        if (!cleared && gl && !gl.isContextLost()) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        cleared = true;
        renderDom();
      } else {
        renderGL();
      }
    };

    const moving = () =>
      Math.hypot(ph.x - ph.tx, ph.y - ph.ty) > 0.3 ||
      Math.hypot(ph.vx, ph.vy) > 1;

    const frame = (now: number) => {
      raf = 0;
      if (!inView || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      step(dt, now);
      render();
      const p = params.current;
      const fading = vis !== wantVis;
      const drifting = vis > 0 && p.motionSafe && !p.paused && !fallback;
      if (moving() || fading || drifting) {
        raf = requestAnimationFrame(frame);
      } else {
        last = 0;
      }
    };

    function wake() {
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }

    const summon = (x: number, y: number, hold?: number) => {
      // Back from nothing, it appears where you are rather than chasing in
      // from wherever it last dissolved.
      if (vis < 0.05) {
        ph.x = x;
        ph.y = y;
        ph.vx = 0;
        ph.vy = 0;
      }
      ph.tx = x;
      ph.ty = y;
      wantVis = 1;
      armIdle(hold);
      wake();
    };

    api.current = {
      point: (x, y) => {
        const p = params.current;
        mode = "pointer";
        movedAt = performance.now();
        summon(x + p.offsetX, y + p.offsetY);
      },
      focus: (x, y) => {
        mode = "focus";
        summon(x, y);
      },
      leave: () => {
        mode = "away";
        window.clearTimeout(idleTimer);
        wantVis = 0;
        wake();
      },
      appear: (x, y) => {
        // The visitor's own phantom is never taken from them.
        if (mode === "pointer") return;
        mode = "focus";
        summon(x, y, Math.max(900, params.current.idle || 1400));
      },
      restyle: () => {
        restyle();
        render();
        wake();
      },
      wake: () => {
        render();
        wake();
      },
    };

    restyle();
    const sizer = new ResizeObserver(() => {
      layout();
      render();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(idleTimer);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detach();
      tri?.dispose();
      program?.dispose();
      api.current = null;
    };
  }, []);

  React.useEffect(() => {
    api.current?.restyle();
  }, [color]);
  React.useEffect(() => {
    api.current?.wake();
  }, [lag, size, smoke, shape, stretch, opacity, paused, motionSafe]);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };
  const focused = React.useRef<HTMLElement | null>(null);

  const restOn = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    // The tip rests just inside the element's lower right corner, so the
    // form hangs off it rather than over the label.
    const at = local(rect.right - 6, rect.bottom - 6);
    api.current?.focus(at.x, at.y);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    api.current?.point(at.x, at.y);
  };
  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const node = focused.current;
    if (node?.isConnected) restOn(node);
    else api.current?.leave();
  };
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!followFocus) return;
    const target = event.target as HTMLElement;
    if (!target.matches(":focus-visible")) return;
    focused.current = target;
    restOn(target);
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    focused.current = null;
    if (!rootRef.current?.matches(":hover")) api.current?.leave();
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerMove}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn("relative isolate overflow-clip", className)}
    >
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
      />
      {/* The DOM phantom, used only without WebGL2 or after a lost context. */}
      <div
        ref={ghostRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-10 origin-[24%_55%]"
        style={{ opacity: 0 }}
      >
        {shape === "orb" ? (
          <span
            className="absolute top-[8%] left-[2%] size-[64%] rounded-full"
            style={{
              background:
                "radial-gradient(closest-side, currentColor, color-mix(in oklab, currentColor 40%, transparent) 70%, transparent)",
            }}
          />
        ) : (
          <svg
            viewBox="0 0 1 1"
            className="block size-full overflow-visible"
            fill="currentColor"
          >
            <path d={ARROW_PATH} />
          </svg>
        )}
      </div>
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.restyle()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
