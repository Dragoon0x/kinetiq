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

export type SparkScribeProps = {
  /** Glow width in CSS px along a stroke segment. @default 3 */
  width?: number;
  /** Seconds a segment or spark takes to cool from white to transparent. @default 1.6 */
  life?: number;
  /** Spark spawn density multiplier per drag event (2 sparks at 1×). @default 1 */
  sparks?: number;
  /** Spark colour at the hottest point of a stroke, any CSS colour (tokens included) — cools through dark red toward transparent as it ages. @default "#ffb347" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** Hard cap on the stroke's segment ring buffer — matches `u_segments`/`u_ages`. */
const MAX_SEGMENTS = 96;
/** Hard cap on the live spark pool — matches `u_sparks`. */
const MAX_SPARKS = 64;
const SEGMENT_FLOATS = MAX_SEGMENTS * 4;
const SPARK_FLOATS = MAX_SPARKS * 4;
/** Base spark count thrown per qualifying drag event, before the `sparks` multiplier. */
const SPARKS_PER_EVENT = 2;
/** Downward acceleration applied to every spark, in CSS px/s². */
const GRAVITY = 600;
/** Spark launch angle varies this many degrees either side of straight up. */
const SPARK_SPREAD_DEG = 60;
const SPARK_SPEED_MIN = 90;
const SPARK_SPEED_MAX = 260;
/** Below this per-event travel, a move is too small to bother writing a segment for. */
const MOVE_EPSILON = 0.05;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_segments[${MAX_SEGMENTS}];
uniform float u_ages[${MAX_SEGMENTS}];
uniform vec4 u_sparks[${MAX_SPARKS}];
uniform float u_width;
uniform float u_life;
uniform vec4 u_color;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

// Distance from p to the segment a-b.
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 1e-4);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  if (u_still > 0.5) {
    // Reduced motion: no stroke is ever tracked and nothing was ever
    // spawned, so this frame has nothing at all to draw.
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  vec3 litColor = vec3(0.0);
  float litAlpha = 0.0;

  // The cooling path every segment and spark rides: a near-white core,
  // through the spark colour, down to a dark char red as it nears burnout.
  vec3 hotColor = vec3(1.0);
  vec3 charColor = vec3(0.28, 0.03, 0.02);
  float life = max(u_life, 0.001);

  for (int i = 0; i < ${MAX_SEGMENTS}; i += 1) {
    float age = u_ages[i];
    if (age < 0.0) continue;
    vec4 seg = u_segments[i];
    float dist = segDist(px, seg.xy, seg.zw);
    float core = 1.0 - smoothstep(0.0, max(u_width * 0.55, 0.001), dist);
    float halo = 1.0 - smoothstep(0.0, max(u_width * 2.4, 0.002), dist);
    float glow = clamp(core + halo * 0.4, 0.0, 1.0);
    if (glow <= 0.0) continue;

    float ageT = clamp(age / life, 0.0, 1.0);
    vec3 body = mix(hotColor, u_color.rgb, smoothstep(0.0, 0.22, ageT));
    body = mix(body, charColor, smoothstep(0.22, 0.68, ageT));
    float fade = 1.0 - smoothstep(0.6, 1.0, ageT);
    float alpha = glow * fade;
    if (alpha <= 0.0) continue;

    litColor += body * alpha;
    litAlpha += alpha;
  }

  for (int i = 0; i < ${MAX_SPARKS}; i += 1) {
    vec4 sp = u_sparks[i];
    float age = sp.z;
    if (age < 0.0) continue;
    float dist = distance(px, sp.xy);
    float radius = mix(1.2, 2.6, fract(sp.w * 7.0));
    float disc = 1.0 - smoothstep(radius * 0.4, max(radius, 0.002), dist);
    if (disc <= 0.0) continue;

    float ageT = clamp(age / life, 0.0, 1.0);
    vec3 body = mix(hotColor, u_color.rgb, smoothstep(0.0, 0.3, ageT));
    body = mix(body, charColor, smoothstep(0.3, 0.85, ageT));
    float fade = 1.0 - ageT;
    float alpha = disc * fade * fade;
    if (alpha <= 0.0) continue;

    litColor += body * alpha;
    litAlpha += alpha;
  }

  if (litAlpha <= 0.0015) {
    o_color = vec4(0.0);
    return;
  }
  vec3 avgColor = litColor / litAlpha;
  o_color = vec4(avgColor, min(litAlpha, 1.0));
}
`;

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Seconds since this segment was written; ages every frame, never reset. */
  age: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds since this spark was thrown; ages every frame, never reset. */
  age: number;
  /** 0..1, hashed once at spawn from the particle's own index — the shader's per-spark radius jitter. */
  seed: number;
};

/** Deterministic, seeded on an integer index — never Math.random. */
function hashIndex(i: number): number {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** How many sparks one qualifying drag event throws, scaled by the `sparks` prop. */
function sparkCountFor(multiplier: number): number {
  return Math.max(0, Math.round(SPARKS_PER_EVENT * multiplier));
}

/**
 * Pushes one segment from (fromX,fromY) to (toX,toY) onto `list` (mutated in
 * place), dropping the oldest once the pool hits MAX_SEGMENTS — the ring
 * buffer's fixed capacity.
 */
function pushSegment(
  list: Segment[],
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  if (list.length >= MAX_SEGMENTS) list.shift();
  list.push({ x1: fromX, y1: fromY, x2: toX, y2: toY, age: 0 });
}

/**
 * Spawns `count` sparks at (x,y) with a hashed, upward-biased velocity
 * (spread ±60° around straight up), pushing onto `list` (mutated in place)
 * and dropping the oldest once the pool hits MAX_SPARKS. Returns the next
 * free spawn index.
 */
function spawnSparks(
  list: Spark[],
  startIndex: number,
  x: number,
  y: number,
  count: number,
): number {
  let index = startIndex;
  for (let i = 0; i < count; i += 1) {
    const hAngle = hashIndex(index);
    const hSpeed = hashIndex(index + 91.233);
    const hSeed = hashIndex(index + 193.71);
    // Straight up is -90deg in screen space (y grows downward); jitter it
    // ±SPARK_SPREAD_DEG either side.
    const angleDeg = -90 + (hAngle * 2 - 1) * SPARK_SPREAD_DEG;
    const angleRad = (angleDeg * Math.PI) / 180;
    const speed =
      SPARK_SPEED_MIN + hSpeed * (SPARK_SPEED_MAX - SPARK_SPEED_MIN);
    const spark: Spark = {
      x,
      y,
      vx: Math.cos(angleRad) * speed,
      vy: Math.sin(angleRad) * speed,
      age: 0,
      seed: hSeed,
    };
    if (list.length >= MAX_SPARKS) list.shift();
    list.push(spark);
    index += 1;
  }
  return index;
}

/** A segment does not move — it only ages toward `life`. */
function stepSegments(list: Segment[], dt: number): void {
  for (let i = 0; i < list.length; i += 1) {
    const s = list[i];
    if (s) s.age += dt;
  }
}

/** One physics step for every live spark: gravity pulls it down, its
 * position integrates on `dt`, then it ages. */
function stepSparks(list: Spark[], dt: number, gravity: number): void {
  for (let i = 0; i < list.length; i += 1) {
    const s = list[i];
    if (!s) continue;
    s.vy += gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.age += dt;
  }
}

/**
 * Drops everything past its own `life` from the front of `list`. Every item
 * ages at the same real-time rate from a shared `dt`, so the earliest-spawned
 * always crosses `life` first — pruning from the front is enough, no scan or
 * sort needed.
 */
function pruneExpired(list: { age: number }[], life: number): void {
  let cut = 0;
  while (cut < list.length) {
    const item = list[cut];
    if (!item || item.age <= life) break;
    cut += 1;
  }
  if (cut > 0) list.splice(0, cut);
}

/**
 * Packs every live segment into `data`/`ages` as flat (x1,y1,x2,y2) quads
 * plus its own age; unused slots get a sentinel age of -1 so the shader
 * skips them for free.
 */
function packSegments(
  data: Float32Array,
  ages: Float32Array,
  list: Segment[],
): void {
  let i = 0;
  for (; i < list.length; i += 1) {
    const s = list[i];
    if (!s) continue;
    const o = i * 4;
    data[o] = s.x1;
    data[o + 1] = s.y1;
    data[o + 2] = s.x2;
    data[o + 3] = s.y2;
    ages[i] = s.age;
  }
  for (; i < MAX_SEGMENTS; i += 1) ages[i] = -1;
}

/**
 * Packs every live spark into `data` as flat (x, y, age, seed) quads; unused
 * slots get a sentinel age of -1 so the shader skips them for free.
 */
function packSparks(data: Float32Array, list: Spark[]): void {
  let i = 0;
  for (; i < list.length; i += 1) {
    const s = list[i];
    if (!s) continue;
    const o = i * 4;
    data[o] = s.x;
    data[o + 1] = s.y;
    data[o + 2] = s.age;
    data[o + 3] = s.seed;
  }
  for (; i < MAX_SPARKS; i += 1) {
    const o = i * 4;
    data[o] = -9999;
    data[o + 1] = -9999;
    data[o + 2] = -1;
    data[o + 3] = 0;
  }
}

type ScribeLayerProps = Required<
  Pick<SparkScribeProps, "width" | "life" | "sparks" | "color">
>;

/**
 * The GL layer. Owns the context, the program, the two particle pools (a
 * segment ring buffer and a spark pool) and the self-stopping simulation
 * loop; reads everything else from the surface.
 */
function ScribeLayer({ width, life, sparks, color }: ScribeLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const segmentsRef = React.useRef<Segment[]>([]);
  const sparksRef = React.useRef<Spark[]>([]);
  const sparkIndexRef = React.useRef(0);
  const segmentDataRef = React.useRef<Float32Array>(
    new Float32Array(SEGMENT_FLOATS),
  );
  const ageDataRef = React.useRef<Float32Array>(new Float32Array(MAX_SEGMENTS));
  const sparkDataRef = React.useRef<Float32Array>(
    new Float32Array(SPARK_FLOATS),
  );
  const colorRef = React.useRef<[number, number, number, number]>([
    1, 0.702, 0.278, 1,
  ]);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ width, life, sparks });
  React.useEffect(() => {
    paramsRef.current = { width, life, sparks };
  });

  // One frame: repack the live segments and sparks, then draw.
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
    const still = !live.motionSafe;
    packSegments(
      segmentDataRef.current,
      ageDataRef.current,
      segmentsRef.current,
    );
    packSparks(sparkDataRef.current, sparksRef.current);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_segments: segmentDataRef.current,
      u_ages: ageDataRef.current,
      u_sparks: sparkDataRef.current,
      u_width: paramsRef.current.width,
      u_life: paramsRef.current.life,
      u_color: colorRef.current,
      u_still: still ? 1 : 0,
    });
    tri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

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
    // A paint may already be waiting: draw it now (still transparent, since
    // nothing has been written yet) rather than on the first drag.
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

  // The spark colour is resolved against the host once it exists, and
  // again if the caller changes it — `var(--token)` needs the host's
  // computed style to read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: pointerdown captures the drag, pointermove writes a
  // segment straight into the ring buffer and throws sparks from the tip,
  // pointerup releases. The loop lives entirely in this effect's closure
  // (plain locals, not refs) — it steps every frame while a segment or spark
  // is still younger than `life` and stops itself the moment both pools
  // empty.
  //
  // Spawning is not left to the loop alone. A handful of synthetic events
  // (Playwright's stepped drags included) can all land before the first
  // animation frame ever runs, so every pointermove writes its own segment
  // and throws its own sparks immediately, synchronously, off the event's
  // own position delta — no frame, no dt, required. The per-frame path
  // below layers extra sparks for a real, continuously moving pointer that
  // outpaces its own event pacing.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    // Reduced motion: no stroke is ever tracked and nothing is ever
    // spawned — the still, fully transparent frame drawn above is the
    // whole story.
    if (!surfaceRef.current.motionSafe) return;

    let raf = 0;
    let lastTs: number | null = null;
    let down = false;
    let captured = false;
    let pointerId: number | null = null;
    let lastPoint: { x: number; y: number } | null = null;
    let movedSinceFrame = false;

    const tick = (ts: number) => {
      raf = 0;
      if (lastTs === null) {
        // First frame since the loop (re)started: only establish the clock
        // baseline. Integrating here would diff against nothing (dt = 0),
        // and stopping on empty pools at this point would never give a
        // genuine second frame the chance to run.
        lastTs = ts;
        drawFrame();
        raf = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min((ts - lastTs) / 1000, 1 / 20);
      lastTs = ts;

      if (down && lastPoint && movedSinceFrame) {
        sparkIndexRef.current = spawnSparks(
          sparksRef.current,
          sparkIndexRef.current,
          lastPoint.x,
          lastPoint.y,
          sparkCountFor(paramsRef.current.sparks),
        );
        movedSinceFrame = false;
      }

      stepSegments(segmentsRef.current, dt);
      stepSparks(sparksRef.current, dt, GRAVITY);
      pruneExpired(segmentsRef.current, paramsRef.current.life);
      pruneExpired(sparksRef.current, paramsRef.current.life);
      drawFrame();

      if (segmentsRef.current.length > 0 || sparksRef.current.length > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        lastTs = null;
      }
    };

    const wake = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      // The pointer is captured only once a real drag begins (see onMove),
      // so a plain click still reaches the controls under the page.
      captured = false;
      pointerId = event.pointerId;
      down = true;
      lastPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      wake();
    };

    const onMove = (event: PointerEvent) => {
      if (!down || event.pointerId !== pointerId) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const next = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const prev = lastPoint;
      lastPoint = next;
      movedSinceFrame = true;
      if (prev) {
        const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
        if (!captured && dist > 4) {
          host.setPointerCapture(event.pointerId);
          captured = true;
        }
        if (dist > MOVE_EPSILON) {
          pushSegment(segmentsRef.current, prev.x, prev.y, next.x, next.y);
          sparkIndexRef.current = spawnSparks(
            sparksRef.current,
            sparkIndexRef.current,
            next.x,
            next.y,
            sparkCountFor(paramsRef.current.sparks),
          );
        }
      }
      wake();
    };

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      down = false;
      pointerId = null;
      lastPoint = null;
      movedSinceFrame = false;
      if (captured && host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
      captured = false;
    };

    host.addEventListener("pointerdown", onDown);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", endDrag);
    host.addEventListener("pointercancel", endDrag);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerup", endDrag);
      host.removeEventListener("pointercancel", endDrag);
      if (raf !== 0) cancelAnimationFrame(raf);
      segmentsRef.current = [];
      sparksRef.current = [];
      sparkIndexRef.current = 0;
    };
  }, [surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="spark-scribe"
      className="block h-full w-full"
    />
  );
}

/**
 * A trail of sparks that follows a drag, never a hover: hold the pointer
 * down and every move writes a fresh segment straight into a 96-slot ring
 * buffer, cooling from white through the spark colour to char over `life`
 * seconds, while a hashed, upward-biased shower of embers throws off the tip
 * and falls under gravity before it burns out. Segments and sparks are
 * written directly from the pointer events themselves — a coarse, stepped
 * drag still leaves an unbroken line — and the self-stopping loop keeps
 * ticking only while a segment or spark is still younger than `life`, going
 * quiet once the last one has cooled. Nothing is simulated ahead of the
 * pointer: every mark traces exactly where the drag went, and the real
 * interface underneath is untouched by any of it.
 * Reduced motion: the canvas draws nothing at all — no stroke, no sparks,
 * the page underneath stands as painted.
 */
export function SparkScribe({
  width = 3,
  life = 1.6,
  sparks = 1,
  color = "#ffb347",
  paint,
  className,
  children,
}: SparkScribeProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <ScribeLayer width={width} life={life} sparks={sparks} color={color} />
      }
    >
      {children}
    </SurfacePaint>
  );
}
