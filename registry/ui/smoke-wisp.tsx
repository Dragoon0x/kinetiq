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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type SmokeWispProps = {
  /** Capsule width at a freshly emitted point, in CSS pixels; it grows to 3x this by the time the point dies. @default 6 */
  width?: number;
  /** How fast a point climbs, in CSS pixels per second. @default 40 */
  rise?: number;
  /** Seconds a point lives before it is dropped from the chain. @default 2.2 */
  life?: number;
  /** Sideways curl strength; 0 keeps the trail rising straight. @default 1 */
  curl?: number;
  /** Smoke colour, any CSS colour (tokens included). @default "#9aa3ad" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** Uniform array length — also the hard cap on how many points the CPU chain keeps. */
const MAX_POINTS = 48;

/** How often, in milliseconds, a new point is stamped at the pointer while it is inside — compared against rAF and PointerEvent timestamps directly, which share the same clock. */
const EMIT_INTERVAL_MS = 40;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_pts[${MAX_POINTS}];
uniform int u_count;
uniform float u_width;
uniform vec3 u_color;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

float capsuleDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  // Reduced motion: no smoke, not even a resting wisp — the surface stays
  // exactly as painted.
  if (u_still > 0.5) { o_color = vec4(0.0); return; }

  vec2 px = v_uv * u_res;
  float w = max(u_width, 0.5);

  // Consecutive live points form a chain of capsules; u_pts[0] seeds the
  // first "previous" so the loop only ever indexes the array by its own
  // counter, never a derived expression.
  vec4 prev = u_pts[0];
  float total = 0.0;
  for (int i = 1; i < ${MAX_POINTS}; i++) {
    if (i >= u_count) break;
    vec4 cur = u_pts[i];
    float t = clamp((prev.z + cur.z) * 0.5, 0.0, 1.0);
    float width = mix(w, w * 3.0, t);
    float d = capsuleDist(px, prev.xy, cur.xy);
    float coverage = 1.0 - smoothstep(max(width * 0.5 - 1.0, 0.0), width * 0.5 + 1.0, d);
    float segAlpha = coverage * (1.0 - t) * (1.0 - t) * 0.6;
    // A soft union rather than a flat sum: each segment's coverage eats into
    // the alpha still remaining, so overlapping smoke thickens toward one
    // clean cap instead of blowing out past the base colour.
    total = total + segAlpha * (1.0 - total);
    prev = cur;
  }

  o_color = vec4(u_color, total);
}
`;

type SmokePoint = {
  x: number;
  y: number;
  age: number;
  life: number;
  /** A stable per-point seed in [0, 1), derived once from a monotonic emission index — never Math.random. */
  hash: number;
};

/** The same cheap sine hash the shader kit's own kx_hash uses, scalarised for a CPU-side index so the drift below never needs a shared RNG. */
function pointHash(index: number): number {
  const s = Math.sin(index * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** A slow, seeded wobble from two out-of-phase sines at frequencies below the main curl term — cheap, deterministic, never Math.random. */
function pseudoNoise(age: number, hash: number): number {
  return (
    Math.sin(age * 0.9 + hash * 31.7) * 0.5 +
    Math.sin(age * 0.37 + hash * 11.3) * 0.5
  );
}

/** Appends one point at (x, y), dropping the oldest first once the chain is already at MAX_POINTS. Mutates `points` in place — called from the loop, never inline in a hook body. */
function emitPoint(
  points: SmokePoint[],
  x: number,
  y: number,
  life: number,
  index: number,
): void {
  if (points.length >= MAX_POINTS) points.shift();
  points.push({ x, y, age: 0, life, hash: pointHash(index) });
}

/** Advances every point by dt — rises, drifts sideways on its own seeded curl plus a slower noise wobble, ages — then drops whatever has outlived its own `life` from the front, since points age out in the order they were born. Mutates `points` in place. */
function stepPoints(
  points: SmokePoint[],
  dt: number,
  rise: number,
  curl: number,
): void {
  for (const point of points) {
    point.age += dt;
    point.y -= rise * dt;
    const sway =
      Math.sin(point.age * 2.1 + point.hash * 6.28318) * curl * dt * 30;
    const wobble = pseudoNoise(point.age, point.hash) * curl * dt * 12;
    point.x += sway + wobble;
  }
  while (points.length > 0 && (points[0]?.age ?? 0) > (points[0]?.life ?? 0)) {
    points.shift();
  }
}

/** Packs up to MAX_POINTS points into the flat (x, y, age/life, hash) buffer `u_pts` expects; any tail past `points.length` is left zeroed. Mutates `out` in place. */
function packPoints(points: SmokePoint[], out: Float32Array): void {
  const n = Math.min(points.length, MAX_POINTS);
  for (let i = 0; i < n; i += 1) {
    const point = points[i];
    if (!point) continue;
    out[i * 4] = point.x;
    out[i * 4 + 1] = point.y;
    out[i * 4 + 2] = point.life > 0 ? Math.min(point.age / point.life, 1) : 1;
    out[i * 4 + 3] = point.hash;
  }
  for (let i = n; i < MAX_POINTS; i += 1) {
    out[i * 4] = 0;
    out[i * 4 + 1] = 0;
    out[i * 4 + 2] = 0;
    out[i * 4 + 3] = 0;
  }
}

type SmokeLayerProps = Required<
  Pick<SmokeWispProps, "width" | "rise" | "life" | "curl" | "color">
>;

/**
 * The GL layer. Owns the context, the program, the point chain, and both
 * loops — the coalesced draw and the physics/emission stepper — reading
 * everything else from the surface. Draws no DOM texture at all: smoke is
 * a pure overlay over the real page beneath it.
 */
function SmokeLayer({ width, rise, life, curl, color }: SmokeLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);
  const colorRgbRef = React.useRef<[number, number, number]>([0, 0, 0]);

  // The chain itself: a plain array in a ref, mutated only through the
  // module-level helpers above. drawFrame packs it every frame it runs.
  const pointsRef = React.useRef<SmokePoint[]>([]);
  const packedRef = React.useRef(new Float32Array(MAX_POINTS * 4));

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ width, rise, life, curl });
  React.useEffect(() => {
    paramsRef.current = { width, rise, life, curl };
  });

  // One frame: pack the current chain into the flat uniform buffer, then
  // draw. No texture to upload — this layer never samples the page.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
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

    packPoints(pointsRef.current, packedRef.current);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_pts: packedRef.current,
      u_count: Math.min(pointsRef.current.length, MAX_POINTS),
      u_width: p.width,
      u_color: colorRgbRef.current,
      u_still: live.motionSafe ? 0 : 1,
    });
    tri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount — a mount-only effect would run against no canvas at all.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: false });
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // Draw the (empty) first frame now — this layer never waits on a
    // painted texture, so there is no version to gate on.
    requestFrame();

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

  // Colour is resolved against the host once it exists, and again if the
  // caller changes it — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const [r, g, b] = resolveColor(color, host);
    colorRgbRef.current = [r, g, b];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: while it is inside, stamp a point every 40ms and
  // keep the physics loop fed. The loop is not continuous — it wakes on
  // entry (or the first move, in case an entry was missed) and keeps
  // ticking while the pointer is inside or any point in the chain is still
  // alive, stopping itself once both go empty.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    // Reduced motion: no smoke is ever emitted, so there is nothing to
    // listen for and no loop to start.
    if (!surfaceRef.current.motionSafe) return;

    let pointerX = 0;
    let pointerY = 0;
    let inside = false;
    let lastEmitAt: number | null = null;
    let indexCounter = 0;
    let lastTime: number | null = null;
    let raf = 0;
    // Starts true so a pointer that enters before the IntersectionObserver's
    // first (necessarily async) callback can still start the loop — a gate
    // that sweeps the pointer in immediately can easily land inside that
    // window, and a stale "not yet reported" state must never read as "not
    // in view".
    let inView = true;

    // Shared by both the loop and the pointer handlers, keyed on the same
    // clock rAF timestamps and PointerEvent.timeStamp already share, so
    // "was there a point stamped in the last 40ms" has one true answer no
    // matter which of the two paths is asking.
    const maybeEmit = (x: number, y: number, atMs: number) => {
      if (lastEmitAt !== null && atMs - lastEmitAt < EMIT_INTERVAL_MS) return;
      lastEmitAt = atMs;
      indexCounter += 1;
      emitPoint(pointsRef.current, x, y, paramsRef.current.life, indexCounter);
    };

    const stepSmoke = (now: number) => {
      raf = 0;
      if (lastTime === null) {
        // First frame after (re)starting: establish the baseline only. A
        // dt of 0 here would both skip this tick's ageing (harmless) and,
        // under the old logic, leave the chain still empty right when the
        // loop checked whether to reschedule — stopping it before it ever
        // got a second tick to reach 40ms. Falling through to the
        // reschedule check below instead of returning early keeps that
        // from happening again.
        lastTime = now;
      } else {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        if (inside) maybeEmit(pointerX, pointerY, now);
        stepPoints(
          pointsRef.current,
          dt,
          paramsRef.current.rise,
          paramsRef.current.curl,
        );
        requestFrame();
      }

      if ((inside || pointsRef.current.length > 0) && inView) {
        raf = requestAnimationFrame(stepSmoke);
      }
    };

    const wake = () => {
      if (raf !== 0 || !inView) return;
      lastTime = null;
      raf = requestAnimationFrame(stepSmoke);
    };

    // A jump straight into the host can, in some pointer-event sequences,
    // deliver a pointermove with no preceding pointerenter — so move treats
    // "inside" and "start the loop" exactly like enter does, not just enter.
    const arrive = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      inside = true;
      maybeEmit(pointerX, pointerY, event.timeStamp);
      wake();
    };
    const leave = () => {
      inside = false;
    };
    const cancel = () => {
      inside = false;
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      if (inView) wake();
    });
    intersection.observe(host);

    host.addEventListener("pointermove", arrive);
    host.addEventListener("pointerenter", arrive);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", cancel);
    return () => {
      host.removeEventListener("pointermove", arrive);
      host.removeEventListener("pointerenter", arrive);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", cancel);
      intersection.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="smoke-wisp"
      className="block h-full w-full"
    />
  );
}

/**
 * A wisp of smoke rises from wherever the pointer lingers. While the
 * pointer sits over the surface, a point is stamped at its position every
 * 40ms and handed to a small CPU chain — at most 48 points, each rising,
 * ageing, and curling sideways on its own seeded sine plus a slow
 * deterministic wobble, never a random number. The fragment shader threads
 * consecutive points into soft capsules that widen and fade with age,
 * combined by a soft union rather than a flat sum so overlapping smoke
 * thickens toward one clean cap instead of blowing out. The loop is not
 * continuous: it wakes on entry and keeps ticking while the pointer is
 * inside or any point in the chain is still alive, stopping itself a
 * couple of seconds after the pointer leaves and the last of the chain
 * dissolves.
 * Reduced motion: no point is ever emitted and the shader draws nothing, so
 * the surface underneath shows exactly as painted.
 */
export function SmokeWisp({
  width = 6,
  rise = 40,
  life = 2.2,
  curl = 1,
  color = "#9aa3ad",
  paint,
  className,
  children,
}: SmokeWispProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <SmokeLayer
          width={width}
          rise={rise}
          life={life}
          curl={curl}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
