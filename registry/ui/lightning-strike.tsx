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

export type LightningStrikeProps = {
  /** Branches leaving the main bolt, clamped to the segment budget. @default 3 */
  branches?: number;
  /** Per-vertex jitter, in units of 40 CSS px. @default 1 */
  jitter?: number;
  /** Glow width — a segment's falloff radius grows with this. @default 1.6 */
  width?: number;
  /** Full-page flash alpha multiplier on strike (0..1). @default 0.6 */
  flash?: number;
  /** Scorch mark lifetime in seconds. @default 1.4 */
  scorch?: number;
  /** Bolt tint colour, any CSS colour (tokens included). @default "#bcd4ff" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** `u_segments`'s fixed length: fourteen for the main bolt plus up to
 * MAX_BRANCHES shorter branches of BRANCH_SEGMENTS each. */
const MAX_SEGMENTS = 48;
/** Segments in the main polyline, top of the host down to the click point. */
const MAIN_SEGMENTS = 14;
/** Segments per branch. */
const BRANCH_SEGMENTS = 5;
/** Hard cap on `branches` so the branch pool never overruns MAX_SEGMENTS. */
const MAX_BRANCHES = Math.floor(
  (MAX_SEGMENTS - MAIN_SEGMENTS) / BRANCH_SEGMENTS,
);
/** How many recent strikes stay tracked for their scorch marks at once. */
const MAX_STRIKES = 3;
/** Age (seconds) reported before any strike has ever landed, or for an
 * empty scorch slot — large enough that every fade curve below lands at
 * zero without a branch. */
const SENTINEL_AGE = 999;
/** Past this age the bolt glow and the flash have both decayed to nothing
 * on their exponential curves, so the loop has nothing left to draw for
 * the newest strike (only a still-fading scorch mark can keep it alive). */
const BOLT_FLASH_LOOP_LIFE = 1;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_segments[${MAX_SEGMENTS}];
uniform int u_segmentCount;
uniform float u_age;
uniform vec4 u_scorch[${MAX_STRIKES}];
uniform float u_scorchLife;
uniform float u_flash;
uniform float u_width;
uniform vec3 u_color;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

// Shortest distance from p to the segment a-b.
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float denom = max(dot(ab, ab), 0.0001);
  float t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
  return length(p - (a + ab * t));
}

void main() {
  vec2 px = v_uv * u_res;

  if (u_still > 0.5) {
    // Reduced motion: a brief flash only, no bolt and no scorch.
    float stillFlash = clamp(u_flash * exp(-u_age * 12.0), 0.0, 1.0);
    o_color = vec4(vec3(1.0), stillFlash);
    return;
  }

  vec3 rgb = vec3(0.0);
  float a = 0.0;

  // Scorch: up to MAX_STRIKES independent soft blots, one per recent
  // strike, each fading on its own clock over u_scorchLife seconds.
  for (int i = 0; i < ${MAX_STRIKES}; i++) {
    vec4 s = u_scorch[i];
    float life = clamp(1.0 - s.z / max(u_scorchLife, 0.0001), 0.0, 1.0);
    float dist = length(px - s.xy);
    float edge = 1.0 - smoothstep(0.0, 40.0, dist);
    float alpha = life * edge * 0.5;
    rgb = rgb * (1.0 - alpha);
    a = alpha + a * (1.0 - alpha);
  }

  // Bolt glow: exponential falloff summed over the live segments, the
  // whole sum faded by the strike's age.
  float glow = 0.0;
  for (int i = 0; i < ${MAX_SEGMENTS}; i++) {
    if (i >= u_segmentCount) break;
    vec4 seg = u_segments[i];
    float d = segDist(px, seg.xy, seg.zw);
    glow += exp(-d * 0.4 / max(u_width, 0.05));
  }
  glow *= exp(-u_age * 6.0);

  // A tinted halo builds toward a white core near the segment lines.
  float tintT = smoothstep(0.0, 0.15, glow);
  float coreT = smoothstep(0.65, 0.95, glow);
  vec3 boltColor = mix(vec3(0.0), u_color, tintT);
  boltColor = mix(boltColor, vec3(1.0), coreT);
  float boltAlpha = clamp(1.0 - exp(-glow), 0.0, 1.0);
  rgb = boltColor * boltAlpha + rgb * (1.0 - boltAlpha);
  a = boltAlpha + a * (1.0 - boltAlpha);

  // Flash: a full-page wash tied to the same strike's age.
  float flashAlpha = clamp(u_flash * exp(-u_age * 12.0), 0.0, 1.0);
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
 * segment count. The main polyline runs from a jittered point above the
 * host down to the exact click point; every interior vertex is offset by
 * an amount hashed from `clickCount` and the vertex's own index, scaled by
 * `jitter` * 40px and tapered to zero so the line still lands exactly on
 * the click. Up to `branchesWanted` shorter branches (clamped to what's
 * left of the MAX_SEGMENTS budget) fork off hashed vertices partway down
 * the main bolt.
 */
function buildStrike(
  target: Float32Array,
  clickX: number,
  clickY: number,
  clickCount: number,
  branchesWanted: number,
  jitter: number,
): number {
  const amp = Math.max(jitter, 0) * 40;
  const topJitter = (hash2(clickCount, -1) - 0.5) * 2 * amp;
  const topX = clickX + topJitter;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= MAIN_SEGMENTS; i += 1) {
    const t = i / MAIN_SEGMENTS;
    let x = topX + (clickX - topX) * t;
    const y = clickY * t;
    if (i > 0 && i < MAIN_SEGMENTS) {
      const taper = 1 - t;
      x += (hash2(clickCount, i) - 0.5) * 2 * amp * taper;
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
      2 +
      Math.floor(hash2(clickCount, 200 + b) * Math.max(MAIN_SEGMENTS - 3, 1));
    const anchor = points[anchorIndex] ?? points[0];
    if (!anchor) continue;
    const dirSign = hash2(clickCount, 300 + b) < 0.5 ? -1 : 1;
    let angle =
      Math.PI / 2 + dirSign * (0.35 + hash2(clickCount, 400 + b) * 0.5);
    let bx = anchor.x;
    let by = anchor.y;
    let length = amp * 0.6 + hash2(clickCount, 500 + b) * amp * 0.4;
    for (let j = 0; j < BRANCH_SEGMENTS; j += 1) {
      angle += (hash2(clickCount, (b + 1) * 1000 + j) - 0.5) * 0.9;
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

type Strike = { x: number; y: number; born: number };

/** Appends a strike to the small ring buffer (capacity MAX_STRIKES),
 * evicting the oldest once it's full, and returns the same array — the
 * mutation happens here, inside a module-level helper, so a ref
 * reassignment (`ref.current = pushStrike(ref.current, s)`) is the only
 * thing the caller ever does with it. */
function pushStrike(strikes: Strike[], strike: Strike): Strike[] {
  strikes.push(strike);
  while (strikes.length > MAX_STRIKES) strikes.shift();
  return strikes;
}

/** Packs up to MAX_STRIKES scorch points into the shared vec4 buffer
 * uploaded as u_scorch — x, y, age in seconds, and an unused fourth
 * slot. Any slot beyond the live strikes is padded with a point off
 * screen and an age past every fade curve, so it never contributes. */
function packScorch(
  target: Float32Array,
  strikes: Strike[],
  tick: number,
): void {
  for (let i = 0; i < MAX_STRIKES; i += 1) {
    const strike = strikes[i];
    const o = i * 4;
    if (strike) {
      target[o] = strike.x;
      target[o + 1] = strike.y;
      target[o + 2] = (tick - strike.born) / 1000;
      target[o + 3] = 0;
    } else {
      target[o] = -9999;
      target[o + 1] = -9999;
      target[o + 2] = SENTINEL_AGE;
      target[o + 3] = 0;
    }
  }
}

type LightningStrikeLayerProps = Required<
  Pick<
    LightningStrikeProps,
    "branches" | "jitter" | "width" | "flash" | "scorch" | "color"
  >
>;

/**
 * The GL layer. Owns the context, the program, the segment buffer for the
 * most recent bolt, the small scorch history, and the frame loop; reads
 * everything else from the surface. There is no page texture here — the
 * strike draws only scorch, bolt and flash, all zero-alpha elsewhere, so
 * it never needs to sample what it sits over.
 */
function LightningStrikeLayer({
  branches,
  jitter,
  width,
  flash,
  scorch,
  color,
}: LightningStrikeLayerProps) {
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
  const paramsRef = React.useRef({ branches, jitter, width, flash, scorch });
  React.useEffect(() => {
    paramsRef.current = { branches, jitter, width, flash, scorch };
  });

  // The most recent bolt's geometry — never a pool: a fresh click simply
  // overwrites it, since the glow only ever draws the newest strike.
  const segmentsRef = React.useRef(new Float32Array(MAX_SEGMENTS * 4));
  const segmentCountRef = React.useRef(0);
  const lastBornRef = React.useRef<number | null>(null);
  const clickCountRef = React.useRef(0);

  // Up to MAX_STRIKES recent strikes, kept only for their scorch marks —
  // a quick flurry of clicks leaves a trail of independently fading burns
  // instead of one overwriting the last. Packed fresh into a flat uniform
  // buffer every frame.
  const strikesRef = React.useRef<Strike[]>([]);
  const scorchUniformRef = React.useRef(new Float32Array(MAX_STRIKES * 4));

  const colorRef = React.useRef<[number, number, number]>([1, 1, 1]);

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

  // One frame: age the newest strike, pack the scorch history, draw, then
  // — only while the newest bolt/flash hasn't finished decaying or a
  // tracked scorch mark is still fading — ask for the next frame. The loop
  // stops on its own the moment nothing is left to animate.
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

      const born = lastBornRef.current;
      const age = born === null ? SENTINEL_AGE : (tick - born) / 1000;
      packScorch(scorchUniformRef.current, strikesRef.current, tick);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.set({
        u_res: [cssW, cssH],
        u_segments: segmentsRef.current,
        u_segmentCount: segmentCountRef.current,
        u_age: age,
        u_scorch: scorchUniformRef.current,
        u_scorchLife: p.scorch,
        u_flash: p.flash,
        u_width: p.width,
        u_color: colorRef.current,
        u_still: still ? 1 : 0,
      });
      tri.draw();

      let anyAlive = age < BOLT_FLASH_LOOP_LIFE;
      if (!anyAlive) {
        for (let i = 0; i < strikesRef.current.length; i += 1) {
          const strike = strikesRef.current[i];
          if (!strike) continue;
          if ((tick - strike.born) / 1000 < p.scorch) {
            anyAlive = true;
            break;
          }
        }
      }
      if (live.active && anyAlive) requestFrame();
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
    // A paint may already be waiting: draw the current (blank, if nothing
    // has struck yet) frame now rather than waiting on a click.
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

  // Resolve the tint colour against the host's theme whenever either
  // changes, so a `var(--token)` reads the theme that applies here.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: a click builds a fresh bolt and pushes a scorch
  // entry. Reduced motion still records when the click landed — u_age
  // keeps driving the flash-only branch in the shader — but never builds
  // segments or a scorch entry, so no bolt is left to fade later.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const down = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      clickCountRef.current += 1;
      const born = performance.now();
      lastBornRef.current = born;

      if (surfaceRef.current.motionSafe) {
        segmentCountRef.current = buildStrike(
          segmentsRef.current,
          clickX,
          clickY,
          clickCountRef.current,
          paramsRef.current.branches,
          paramsRef.current.jitter,
        );
        strikesRef.current = pushStrike(strikesRef.current, {
          x: clickX,
          y: clickY,
          born,
        });
      } else {
        segmentCountRef.current = 0;
      }
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
      data-effect-canvas="lightning-strike"
      className="block h-full w-full"
    />
  );
}

/**
 * Lightning under the cursor. Click, and a bolt is built once, on the CPU,
 * not once per frame: fourteen segments walk from a jittered point above
 * the host down to the exact click point, each interior vertex offset by
 * a hash of the click count and its own index so the same click never
 * draws the same crack twice, and up to `branches` shorter forks leave the
 * main line at hashed vertices. The GPU only sums a glow around those
 * uploaded segments — a white core where it saturates, `color` in the
 * halo — while a full-page flash and a soft scorch mark decay on the same
 * clock. Up to three strikes stay tracked at once, so a quick flurry of
 * clicks leaves a trail of independently fading scorch marks instead of
 * one overwriting the last, and the frame loop runs only while one of
 * them still has something left to fade.
 * Reduced motion: a click gives a brief flash and nothing else — no
 * segments are built and no scorch is left behind.
 */
export function LightningStrike({
  branches = 3,
  jitter = 1,
  width = 1.6,
  flash = 0.6,
  scorch = 1.4,
  color = "#bcd4ff",
  paint,
  className,
  children,
}: LightningStrikeProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <LightningStrikeLayer
          branches={branches}
          jitter={jitter}
          width={width}
          flash={flash}
          scorch={scorch}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
