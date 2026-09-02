"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type TouchEchoProps = {
  /** Selector matched against the element under the pointer; its host-relative rect and corner radius become the echo's shape. @default "button, tr, [data-echo]" */
  selector?: string;
  /** How far the ring and flash expand past the source shape's edge, in CSS pixels. @default 28 */
  spread?: number;
  /** Ring and flash colour. @default "#2563eb" */
  color?: string;
  /** Flash brightness at the moment of impact (0..1). @default 0.25 */
  flash?: number;
  /** Seconds an echo takes to expand out and fade away. @default 1 */
  duration?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** The fixed echo pool size — `u_echoes`/`u_echoR`/`u_echoAge` are length-4 arrays. */
const MAX_ECHOES = 4;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_echoes[4];
uniform float u_echoR[4];
uniform float u_echoAge[4];
uniform float u_spread;
uniform float u_flash;
uniform vec3 u_color;
in vec2 v_uv;
out vec4 o_color;

// Signed distance from p to a rounded rect of the given half-size and
// corner radius, both centred on the origin.
float sdRoundRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  vec2 px = v_uv * u_res;
  float alpha = 0.0;

  for (int i = 0; i < 4; i++) {
    float a = u_echoAge[i];
    // Ages land in [0, 1) while an echo is alive; 1 (or more) is the dead
    // sentinel written for an empty or expired slot.
    if (a < 0.0 || a >= 1.0) continue;

    vec4 echo = u_echoes[i];
    vec2 centre = echo.xy;
    vec2 halfSize = echo.zw * 0.5 + vec2(a * u_spread);
    float radius = u_echoR[i] + a * u_spread;
    float d = sdRoundRect(px - centre, halfSize, radius);

    float ring = (1.0 - smoothstep(0.0, 2.0, abs(d))) * (1.0 - a);
    float flash = step(d + a * u_spread, 0.0) * u_flash * clamp(1.0 - a * 4.0, 0.0, 1.0);
    alpha = max(alpha, max(ring, flash));
  }

  o_color = vec4(u_color, alpha * 0.9);
}
`;

type TouchEchoLayerProps = Required<
  Pick<TouchEchoProps, "selector" | "spread" | "color" | "flash" | "duration">
>;

/** One in-flight (or, under reduced motion, frozen) echo shape. */
type EchoShape = { x: number; y: number; w: number; h: number; r: number };

/** The pointer's own shape, taken from whatever it landed on: the matched
 * element's host-relative rect and its top-left border radius, or — when
 * nothing under the selector was hit — a 40x40, radius-20 stand-in centred
 * on the pointer so a click on bare padding still has something to echo. */
function shapeAt(
  host: HTMLElement,
  clientX: number,
  clientY: number,
  selector: string,
): EchoShape {
  const rect = host.getBoundingClientRect();
  const hit = document.elementFromPoint(clientX, clientY);
  const closest = hit?.closest(selector) ?? null;
  const el =
    closest instanceof HTMLElement && host.contains(closest) ? closest : null;

  if (el) {
    const elRect = el.getBoundingClientRect();
    const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius);
    return {
      x: elRect.left - rect.left + elRect.width / 2,
      y: elRect.top - rect.top + elRect.height / 2,
      w: elRect.width,
      h: elRect.height,
      r: Number.isFinite(radius) ? radius : 0,
    };
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
    w: 40,
    h: 40,
    r: 20,
  };
}

/**
 * The GL layer. Owns the context, the program, the echo pool, and the frame
 * loop; reads everything else from the surface. No texture ever crosses
 * into GL here — the shader is pure geometry over the ring buffer.
 */
function TouchEchoLayer({
  selector,
  spread,
  color,
  flash,
  duration,
}: TouchEchoLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const drawFrameRef = React.useRef<((tick: number) => void) | null>(null);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ selector, spread, color, flash, duration });
  React.useEffect(() => {
    paramsRef.current = { selector, spread, color, flash, duration };
  });

  const colorRef = React.useRef<[number, number, number]>([0.14, 0.39, 0.92]);

  // Fixed echo pool (struct-of-arrays, never React state) — `cursor` round-
  // robins so a fifth click recycles the oldest echo rather than dropping
  // the newest. `born` is the rAF tick (ms) the echo was pushed.
  const echoesRef = React.useRef({
    x: new Float32Array(MAX_ECHOES),
    y: new Float32Array(MAX_ECHOES),
    w: new Float32Array(MAX_ECHOES),
    h: new Float32Array(MAX_ECHOES),
    r: new Float32Array(MAX_ECHOES),
    born: new Float32Array(MAX_ECHOES).fill(-1e6),
    cursor: 0,
  });
  // Reduced motion keeps exactly one echo, frozen — no pool, no ages.
  const stillEchoRef = React.useRef<EchoShape | null>(null);
  // Latest rAF timestamp the loop has observed — never Date.now(); read by
  // the pointerdown handler so a pushed echo is born on the same clock the
  // loop ages echoes against.
  const tickRef = React.useRef(0);

  const echoVecRef = React.useRef(new Float32Array(MAX_ECHOES * 4));
  const echoRRef = React.useRef(new Float32Array(MAX_ECHOES));
  const echoAgeRef = React.useRef(new Float32Array(MAX_ECHOES).fill(1));

  // Coalescing scheduler. Stable identity (empty deps) so the GL setup
  // effect below only re-runs when `surface.active` flips — it calls
  // through `drawFrameRef` rather than closing over `drawFrame` directly,
  // which is what lets a self-rescheduling loop avoid becoming a
  // self-referential callback.
  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame((tick) => {
      frameRef.current = null;
      drawFrameRef.current?.(tick);
    });
  }, []);

  // One frame: age the echo pool (or read the one frozen echo), draw, then
  // — only while an echo is still alive — ask for the next frame. Under
  // reduced motion there is nothing to age, so the loop never continues:
  // one click, one draw, done.
  const drawFrame = React.useCallback(
    (tick: number) => {
      tickRef.current = tick;
      const gl = glRef.current;
      const program = programRef.current;
      const tri = triRef.current;
      const canvas = canvasRef.current;
      const live = surfaceRef.current;
      if (!gl || !program || !tri || !canvas) return;
      if (gl.isContextLost()) return;

      const size = resizeGL(gl, canvas, { dprCap: 2 });
      const cssW = size.width / size.dpr;
      const cssH = size.height / size.dpr;
      const p = paramsRef.current;
      const still = !live.motionSafe;

      const vecs = echoVecRef.current;
      const radii = echoRRef.current;
      const ages = echoAgeRef.current;
      let anyAlive = false;

      if (still) {
        const s = stillEchoRef.current;
        for (let i = 0; i < MAX_ECHOES; i += 1) {
          const o = i * 4;
          if (i === 0 && s) {
            vecs[o] = s.x;
            vecs[o + 1] = s.y;
            vecs[o + 2] = s.w;
            vecs[o + 3] = s.h;
            radii[i] = s.r;
            ages[i] = 0.3;
          } else {
            vecs[o] = 0;
            vecs[o + 1] = 0;
            vecs[o + 2] = 0;
            vecs[o + 3] = 0;
            radii[i] = 0;
            ages[i] = 1;
          }
        }
      } else {
        const echoes = echoesRef.current;
        for (let i = 0; i < MAX_ECHOES; i += 1) {
          const born = echoes.born[i] ?? -1e6;
          const age = (tick - born) / 1000 / p.duration;
          const alive = age >= 0 && age < 1;
          if (alive) anyAlive = true;
          const o = i * 4;
          vecs[o] = echoes.x[i] ?? 0;
          vecs[o + 1] = echoes.y[i] ?? 0;
          vecs[o + 2] = echoes.w[i] ?? 0;
          vecs[o + 3] = echoes.h[i] ?? 0;
          radii[i] = echoes.r[i] ?? 0;
          ages[i] = alive ? age : 1;
        }
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.set({
        u_res: [cssW, cssH],
        u_echoes: vecs,
        u_echoR: radii,
        u_echoAge: ages,
        u_spread: p.spread,
        u_flash: p.flash,
        u_color: colorRef.current,
      });
      tri.draw();

      if (!still && anyAlive && surfaceRef.current.active) {
        requestFrame();
      }
    },
    [requestFrame],
  );

  React.useEffect(() => {
    drawFrameRef.current = drawFrame;
  });

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect would run against no canvas at all.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) {
      failedRef.current = true;
      return;
    }
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) {
      failedRef.current = true;
      return;
    }
    const tri = createFullscreenTriangle(gl, program);
    glRef.current = gl;
    programRef.current = program;
    triRef.current = tri;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw the (empty) pool now rather than
    // on the next click, so the canvas is never left unsized.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Colour resolves against the host so a `var(--token)` picks up the
  // theme in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const [r, g, b] = resolveColor(color, host);
    colorRef.current = [r, g, b];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointerdown on the host: measure whatever was hit, push (or, under
  // reduced motion, replace) the echo, and kick the loop.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const down = (event: PointerEvent) => {
      const shape = shapeAt(
        host,
        event.clientX,
        event.clientY,
        paramsRef.current.selector,
      );
      if (!surfaceRef.current.motionSafe) {
        stillEchoRef.current = shape;
        requestFrame();
        return;
      }
      const echoes = echoesRef.current;
      const i = echoes.cursor;
      echoes.x[i] = shape.x;
      echoes.y[i] = shape.y;
      echoes.w[i] = shape.w;
      echoes.h[i] = shape.h;
      echoes.r[i] = shape.r;
      echoes.born[i] = tickRef.current;
      echoes.cursor = (i + 1) % MAX_ECHOES;
      requestFrame();
    };

    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointerdown", down);
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="touch-echo"
      className="block h-full w-full"
    />
  );
}

/**
 * The thing you pressed echoes back out. On pointerdown the effect looks
 * under the pointer for a button, row, or `data-echo` element and takes its
 * exact rect and corner radius as the echo's shape — nothing is invented,
 * only measured — then expands that shape into a fading ring with a brief
 * flash at the moment of impact, on a signed-distance rounded rect that
 * grows by `spread` pixels over `duration` seconds. Up to four echoes ring
 * out at once from a small fixed pool; a click on bare padding with nothing
 * under it still echoes a 40x40 stand-in, so every press reads as heard.
 * The canvas draws only the rings and flashes — alpha is zero everywhere
 * else — so the control underneath still takes the real click.
 * Reduced motion: a click still draws one echo, held still at the instant
 * its flash has just cleared — a single ring, drawn once, with no loop.
 */
export function TouchEcho({
  selector = "button, tr, [data-echo]",
  spread = 28,
  color = "#2563eb",
  flash = 0.25,
  duration = 1,
  paint,
  className,
  children,
}: TouchEchoProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={className}
      effect={
        <TouchEchoLayer
          selector={selector}
          spread={spread}
          color={color}
          flash={flash}
          duration={duration}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
