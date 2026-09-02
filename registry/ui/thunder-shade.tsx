"use client";

import * as React from "react";

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
import type { PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type ThunderShadeProps = {
  /** Cloud shadow opacity multiplier (0..1). @default 0.35 */
  shade?: number;
  /** Cloud drift speed while the pointer rests inside. @default 1 */
  drift?: number;
  /** Blue tint mixed into the bolt core (0..1). @default 1 */
  bolt?: number;
  /** Full-page flash alpha multiplier on strike (0..1). @default 0.6 */
  flash?: number;
  /** Branches leaving the main bolt, clamped to the segment budget. @default 3 */
  branches?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** `u_segments`'s fixed length: 12 for the main bolt plus up to
 * MAX_BRANCHES shorter branches of BRANCH_SEGMENTS each. */
const MAX_SEGMENTS = 48;
/** Segments in the main polyline, top of the host down to the click point. */
const MAIN_SEGMENTS = 12;
/** Segments per branch. */
const BRANCH_SEGMENTS = 4;
/** Hard cap on `branches` so the branch pool never overruns MAX_SEGMENTS. */
const MAX_BRANCHES = Math.floor(
  (MAX_SEGMENTS - MAIN_SEGMENTS) / BRANCH_SEGMENTS,
);
/** Seconds the rAF loop keeps a strike alive for — past this the glow, the
 * scorch and the flash have all reached zero on their own curves. */
const STRIKE_LOOP_LIFE = 1.3;
/** Age (seconds) reported before any strike has ever landed — large enough
 * that every fade curve in the shader lands at zero without a branch. */
const STRIKE_SENTINEL_AGE = 999;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_tick;
uniform float u_drift;
uniform float u_shade;
uniform float u_bolt;
uniform float u_flash;
uniform float u_still;
uniform vec4 u_segments[${MAX_SEGMENTS}];
uniform int u_segmentCount;
uniform float u_strikeAge;
uniform vec2 u_scorch;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

// Shortest distance from p to the segment a-b.
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float denom = max(dot(ab, ab), 0.0001);
  float t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
  return length(p - (a + ab * t));
}

void main() {
  vec2 px = v_uv * u_res;

  // Cloud shadow: a single fbm field drifting on the shared clock,
  // thresholded softly so the edge reads as ragged cover, not a hard mask.
  float n = kx_fbm(px * 0.002 + vec2(u_tick * u_drift * 0.02));
  float cloud = smoothstep(0.45, 0.7, n);
  float cloudAlpha = clamp(cloud * u_shade, 0.0, 1.0);

  if (u_still > 0.5) {
    // Reduced motion: the still shadow only, no strike.
    o_color = vec4(0.0, 0.0, 0.0, cloudAlpha);
    return;
  }

  // Everything below composites with a standard premultiplied "over" —
  // cloud, then the scorch, then the bolt, then the flash on top — and is
  // unpremultiplied once at the end for the SRC_ALPHA screen blend.
  vec3 rgb = vec3(0.0);
  float a = cloudAlpha;

  // Scorch: a soft dark blot at the strike point, fading over 1.2s.
  float scorchFade = clamp(1.0 - u_strikeAge / 1.2, 0.0, 1.0);
  float scorchDist = length(px - u_scorch);
  float scorchAlpha = (1.0 - smoothstep(0.0, 44.0, scorchDist)) * scorchFade * 0.5;
  rgb = rgb * (1.0 - scorchAlpha);
  a = scorchAlpha + a * (1.0 - scorchAlpha);

  // Bolt glow: exponential falloff from every live segment, summed then
  // tonemapped so a knot of nearby segments never just clips to a flat
  // white plateau. Fades over 0.4s.
  float glow = 0.0;
  for (int i = 0; i < ${MAX_SEGMENTS}; i++) {
    if (i >= u_segmentCount) break;
    vec4 s = u_segments[i];
    float d = segDist(px, s.xy, s.zw);
    glow += exp(-d * 0.35);
  }
  float boltFade = clamp(1.0 - u_strikeAge / 0.4, 0.0, 1.0);
  glow *= boltFade;
  float boltAlpha = clamp(1.0 - exp(-glow), 0.0, 1.0);
  vec3 boltColor = mix(vec3(1.0), vec3(0.6, 0.75, 1.0), clamp(u_bolt, 0.0, 1.0));
  rgb = boltColor * boltAlpha + rgb * (1.0 - boltAlpha);
  a = boltAlpha + a * (1.0 - boltAlpha);

  // Flash: a full-page wash for the first 0.15s, decaying fast after.
  float flashCutoff = 1.0 - step(0.15, u_strikeAge);
  float flashAlpha = clamp(u_flash * exp(-u_strikeAge * 12.0) * flashCutoff, 0.0, 1.0);
  rgb = vec3(1.0) * flashAlpha + rgb * (1.0 - flashAlpha);
  a = flashAlpha + a * (1.0 - flashAlpha);

  vec3 straight = a > 0.0001 ? rgb / a : vec3(0.0);
  o_color = vec4(straight, a);
}
`;

/** Deterministic 2D hash, same shape as the shader's own kx_hash, so a
 * bolt's jitter is seeded rather than drawn from Math.random. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Builds one strike into `target` (a reused Float32Array of
 * MAX_SEGMENTS*4 floats, vec4 x1/y1/x2/y2 per segment) and returns the
 * segment count. The main polyline runs from a jittered point at the top
 * of the host down to the exact click point; interior vertices jitter by
 * an amount hashed from `clickId` and their own index, tapering toward
 * zero at the click point itself. Up to `branchesWanted` shorter branches
 * (clamped to fit what's left of the MAX_SEGMENTS budget) fork off hashed
 * vertices partway down the main bolt.
 */
function buildStrike(
  target: Float32Array,
  clickX: number,
  clickY: number,
  clickId: number,
  branchesWanted: number,
): number {
  const topJitter = (hash2(clickId, -1) - 0.5) * 2 * 46;
  const topX = clickX + topJitter;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= MAIN_SEGMENTS; i += 1) {
    const t = i / MAIN_SEGMENTS;
    let x = topX + (clickX - topX) * t;
    const y = clickY * t;
    if (i > 0 && i < MAIN_SEGMENTS) {
      const amp = 34 * (1 - t) + 6;
      x += (hash2(clickId * 97 + i, i * 13 + 3) - 0.5) * 2 * amp;
    }
    points.push({ x, y });
  }

  let count = 0;
  for (let i = 0; i < MAIN_SEGMENTS; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (!from || !to) continue;
    const o = count * 4;
    target[o] = from.x;
    target[o + 1] = from.y;
    target[o + 2] = to.x;
    target[o + 3] = to.y;
    count += 1;
  }

  const branchBudget = Math.floor((MAX_SEGMENTS - count) / BRANCH_SEGMENTS);
  const branches = Math.max(
    0,
    Math.min(Math.round(branchesWanted), branchBudget, MAX_BRANCHES),
  );
  for (let b = 0; b < branches; b += 1) {
    const anchorIndex =
      2 + Math.floor(hash2(clickId, 200 + b) * Math.max(MAIN_SEGMENTS - 3, 1));
    const anchor = points[anchorIndex] ?? points[0];
    if (!anchor) continue;
    const dirSign = hash2(clickId, 300 + b) < 0.5 ? -1 : 1;
    let angle = Math.PI / 2 + dirSign * (0.35 + hash2(clickId, 400 + b) * 0.5);
    let bx = anchor.x;
    let by = anchor.y;
    let length = 22 + hash2(clickId, 500 + b) * 18;
    for (let j = 0; j < BRANCH_SEGMENTS; j += 1) {
      angle += (hash2(clickId, (b + 1) * 1000 + j) - 0.5) * 0.9;
      const nx = bx + Math.cos(angle) * length;
      const ny = by + Math.sin(angle) * length;
      const o = count * 4;
      target[o] = bx;
      target[o + 1] = by;
      target[o + 2] = nx;
      target[o + 3] = ny;
      count += 1;
      bx = nx;
      by = ny;
      length *= 0.72;
    }
  }

  return count;
}

type ThunderShadeLayerProps = Required<
  Pick<ThunderShadeProps, "shade" | "drift" | "bolt" | "flash" | "branches">
>;

/**
 * The GL layer. Owns the context, the program, the single active strike's
 * segment buffer, the drift clock, and the frame loop; reads everything
 * else from the surface. There is no page texture here — the storm draws
 * only cloud, scorch, bolt and flash, all zero-alpha elsewhere, so it never
 * needs to sample what it sits over.
 */
function ThunderShadeLayer({
  shade,
  drift,
  bolt,
  flash,
  branches,
}: ThunderShadeLayerProps) {
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
  const paramsRef = React.useRef({ shade, drift, bolt, flash, branches });
  React.useEffect(() => {
    paramsRef.current = { shade, drift, bolt, flash, branches };
  });

  // The one active strike — never a pool: a fresh click simply overwrites
  // it. `born` is the rAF-clock timestamp (ms) the strike started, null
  // before the first strike ever lands.
  const segmentsRef = React.useRef(new Float32Array(MAX_SEGMENTS * 4));
  const segmentCountRef = React.useRef(0);
  const strikeBornRef = React.useRef<number | null>(null);
  const scorchRef = React.useRef({ x: -9999, y: -9999 });
  const clickCountRef = React.useRef(0);

  // The cloud's own clock: seconds, advanced only while the pointer sits
  // inside the host, frozen (never reset) the moment it leaves — so the
  // loop can stop and the drift resumes without a jump when it starts back
  // up, exactly like the pause/resume rebasing on the other idle loops.
  const driftClockRef = React.useRef(0);
  const driftLastTickRef = React.useRef<number | null>(null);
  const pointerInsideRef = React.useRef(false);

  // Coalescing scheduler. Stable identity (empty deps) so the GL setup
  // effect below only re-runs when `surface.active` flips — it calls
  // through `drawFrameRef` rather than closing over `drawFrame` directly,
  // which is what lets this continuous, self-rescheduling loop avoid
  // becoming a self-referential callback.
  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame((tick) => {
      frameRef.current = null;
      drawFrameRef.current?.(tick);
    });
  }, []);

  // One frame: advance the drift clock if the pointer is inside, age the
  // strike, draw, then — only while the strike is still alive or the
  // pointer is inside for the cloud to drift — ask for the next frame. The
  // loop stops on its own the moment neither is true, which is exactly
  // what lets the click driver see the bolt without leaving anything
  // ticking after it fades.
  const drawFrame = React.useCallback(
    (tick: number) => {
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

      if (!still && pointerInsideRef.current) {
        if (driftLastTickRef.current !== null) {
          driftClockRef.current += (tick - driftLastTickRef.current) / 1000;
        }
        driftLastTickRef.current = tick;
      } else {
        driftLastTickRef.current = null;
      }

      const born = strikeBornRef.current;
      const age = born === null ? STRIKE_SENTINEL_AGE : (tick - born) / 1000;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.set({
        u_res: [cssW, cssH],
        u_tick: driftClockRef.current,
        u_drift: p.drift,
        u_shade: p.shade,
        u_bolt: p.bolt,
        u_flash: p.flash,
        u_still: still ? 1 : 0,
        u_segments: segmentsRef.current,
        u_segmentCount: segmentCountRef.current,
        u_strikeAge: age,
        u_scorch: [scorchRef.current.x, scorchRef.current.y],
      });
      tri.draw();

      const strikeAlive = !still && age >= 0 && age < STRIKE_LOOP_LIFE;
      if (!still && live.active && (strikeAlive || pointerInsideRef.current)) {
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
    // A paint may already be waiting: draw the current (still, if nothing
    // has struck yet) frame now rather than waiting on a pointer event.
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

  // Every completed paint asks for one frame. The shader never samples the
  // page itself, but a resize changes u_res, and a first paint is what
  // flips `surface.active` on in the first place.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: track whether it rests inside (the only thing the
  // cloud drift needs) and build a fresh strike on every pointerdown.
  // Reduced motion leaves the listeners attached but inert — pointerdown
  // never builds a strike, so the drawn frame never has one to read.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const enter = () => {
      pointerInsideRef.current = true;
      requestFrame();
    };
    const leave = () => {
      pointerInsideRef.current = false;
      requestFrame();
    };
    const down = (event: PointerEvent) => {
      if (!surfaceRef.current.motionSafe) return;
      const rect = host.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      clickCountRef.current += 1;
      segmentCountRef.current = buildStrike(
        segmentsRef.current,
        clickX,
        clickY,
        clickCountRef.current,
        paramsRef.current.branches,
      );
      scorchRef.current = { x: clickX, y: clickY };
      strikeBornRef.current = performance.now();
      requestFrame();
    };

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("pointerdown", down);
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="thunder-shade"
      className="block h-full w-full"
    />
  );
}

/**
 * A storm crossing the interface. A single noise field, thresholded soft,
 * darkens the page as a ragged cloud shadow that drifts on its own clock
 * while the cursor rests inside — and freezes the instant it leaves, so the
 * loop has nothing left to animate and stops. Click anywhere and lightning
 * answers: a twelve-segment bolt is built on the CPU from the click point
 * back up to the top of the host, jagged from a hash keyed to the click
 * count and each vertex, with a few shorter branches forking off partway
 * down; the GPU only sums a glow around the uploaded line segments, a
 * full-page flash dies inside a tenth of a second, and a scorch mark
 * lingers for a while after the light is gone. Nothing here samples the
 * page underneath — every pixel the storm doesn't touch stays at zero
 * alpha, so the interface below keeps taking real clicks throughout.
 * Reduced motion: a single still shadow renders once, with no drift and no
 * strike — a click does nothing.
 */
export function ThunderShade({
  shade = 0.35,
  drift = 1,
  bolt = 1,
  flash = 0.6,
  branches = 3,
  paint,
  className,
  children,
}: ThunderShadeProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <ThunderShadeLayer
          shade={shade}
          drift={drift}
          bolt={bolt}
          flash={flash}
          branches={branches}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
