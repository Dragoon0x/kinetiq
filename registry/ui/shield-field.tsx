"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
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

export type ShieldLattice = "hex" | "tri" | "grid";

export type ShieldFieldProps = {
  /** Lattice cell size in CSS pixels. @default 28 */
  cell?: number;
  /** Cell shape. @default "hex" */
  lattice?: ShieldLattice;
  /** Resting line opacity (0..1). @default 0.35 */
  lineOpacity?: number;
  /** Lattice and wave colour. @default "var(--primary)" */
  color?: string;
  /** Wave brightness multiplier. @default 1.4 */
  glow?: number;
  /** Shockwave travel speed, px/s. @default 700 */
  waveSpeed?: number;
  /** Width of the lit front band, px. @default 90 */
  waveWidth?: number;
  /** Seconds a wave lives before it fades out. @default 1.6 */
  waveLife?: number;
  /** Concurrent waves kept; oldest evicted past this (capped at 6). @default 6 */
  maxWaves?: number;
  /** Radial page-bend offset under the front, px. @default 6 */
  refraction?: number;
  /** Pointer proximity glow radius, px. @default 90 */
  hover?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** The shader's fixed wave-slot count — `u_waves` is a vec4[6] array, so `maxWaves` is clamped to this. */
const MAX_WAVES = 6;

const LATTICE_CODE: Record<ShieldLattice, number> = { hex: 0, tri: 1, grid: 2 };

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_cell;
uniform float u_lattice;
uniform float u_lineOpacity;
uniform vec3 u_color;
uniform float u_glow;
uniform float u_waveSpeed;
uniform float u_waveWidth;
uniform float u_waveLife;
uniform float u_refraction;
uniform float u_hover;
uniform vec2 u_pointer;
uniform float u_still;
uniform vec4 u_waves[6];
in vec2 v_uv;
out vec4 o_color;

// Square lattice: cell centre (.xy) and distance to the nearest edge (.z).
vec3 gridCell(vec2 p, float size) {
  vec2 idx = floor(p / size);
  vec2 center = (idx + 0.5) * size;
  vec2 local = p - center;
  float edge = size * 0.5 - max(abs(local.x), abs(local.y));
  return vec3(center, edge);
}

// Exact signed distance to a regular hexagon (negative inside), circumradius r.
float sdHexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.5773503);
  vec2 q = abs(p);
  q -= 2.0 * min(dot(k.xy, q), 0.0) * k.xy;
  q -= vec2(clamp(q.x, -k.z * r, k.z * r), r);
  return length(q) * sign(q.y);
}

// Hex lattice: nearest centre via two offset square grids (the standard
// two-grid trick — a hex tiling is the overlap of two rectangular ones),
// then the exact hexagon SDF for the distance to the cell edge.
vec3 hexCell(vec2 p, float r) {
  vec2 c = vec2(r * 1.7320508, r * 1.5);
  vec2 a = mod(p, c) - c * 0.5;
  vec2 b = mod(p - c * 0.5, c) - c * 0.5;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 center = p - gv;
  float edge = max(0.0, -sdHexagon(gv, r));
  return vec3(center, edge);
}

// Triangular lattice edges: the three evenly spaced line families (0, 60,
// 120 degrees) that exactly tile the plane into equilateral triangles.
float triEdgeDist(vec2 p, float size) {
  float d = size;
  for (int i = 0; i < 3; i++) {
    float a = 1.0471975512 * float(i);
    vec2 n = vec2(-sin(a), cos(a));
    float m = mod(dot(p, n), size);
    d = min(d, min(m, size - m));
  }
  return d;
}

// Triangular lattice centre: which half of the rhombic unit cell (in a
// skewed 60-degree basis) the point falls in decides the triangle, and its
// centroid is a fixed offset from that cell's integer corner.
vec2 triCenter(vec2 p, float size) {
  float root3 = 0.8660254;
  float b = p.y / (size * root3);
  float a = p.x / size - b * 0.5;
  float i = floor(a);
  float j = floor(b);
  vec2 ab = fract(a) + fract(b) < 1.0
    ? vec2(i + 1.0 / 3.0, j + 1.0 / 3.0)
    : vec2(i + 2.0 / 3.0, j + 2.0 / 3.0);
  return vec2((ab.x + ab.y * 0.5) * size, ab.y * size * root3);
}

// Cell centre (.xy) and distance to the nearest edge (.z) for the chosen lattice.
vec3 latticeAt(vec2 p) {
  if (u_lattice < 0.5) return hexCell(p, u_cell * 0.5);
  if (u_lattice < 1.5) return vec3(triCenter(p, u_cell), triEdgeDist(p, u_cell));
  return gridCell(p, u_cell);
}

// A symmetric band of width w centred on radius front, sampled at distance d.
float band(float d, float front, float w) {
  float h = w * 0.5;
  return smoothstep(front - h, front, d) * (1.0 - smoothstep(front, front + h, d));
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 cell = latticeAt(px);
  float lineMask = 1.0 - smoothstep(0.0, 1.0, cell.z);

  if (u_still > 0.5) {
    // Reduced motion: the resting lattice only, nothing that moves.
    o_color = vec4(u_color, lineMask * u_lineOpacity);
    return;
  }

  float glowAmt = 0.0;
  float bendAmt = 0.0;
  vec2 bendDir = vec2(0.0);

  for (int i = 0; i < 6; i++) {
    vec4 w = u_waves[i];
    float strength = w.w;
    if (strength <= 0.0) continue;
    float front = w.z * u_waveSpeed;
    float life = clamp(1.0 - w.z / u_waveLife, 0.0, 1.0);

    // Per-pixel band: how far this fragment sits inside the current front,
    // used to bend the real page texture under the ring.
    float pd = distance(px, w.xy);
    float pAmt = strength * life * band(pd, front, u_waveWidth);
    if (pAmt > bendAmt) {
      bendAmt = pAmt;
      bendDir = pd > 0.001 ? (px - w.xy) / pd : vec2(0.0);
    }

    // Per-cell band: the cell's centre, not this pixel, decides whether the
    // whole cell lights — so a cell flashes as one unit as the front crosses it.
    float cd = distance(cell.xy, w.xy);
    glowAmt = max(glowAmt, strength * life * band(cd, front, u_waveWidth));
  }

  float hoverDist = distance(cell.xy, u_pointer);
  float hoverAmt = 1.0 - smoothstep(0.0, u_hover, hoverDist);
  float cellBrightness = clamp(glowAmt * u_glow + hoverAmt * 0.5, 0.0, 1.0);

  vec3 outColor = u_color;
  float outAlpha = clamp(lineMask * u_lineOpacity + cellBrightness * 0.9, 0.0, 1.0);

  if (bendAmt > 0.001) {
    vec2 srcUV = clamp((px + bendDir * u_refraction * bendAmt) / u_res, 0.0, 1.0);
    vec3 bent = texture(u_tex, srcUV).rgb;
    outColor = mix(outColor, bent, bendAmt);
    outAlpha = max(outAlpha, bendAmt);
  }

  o_color = vec4(outColor, outAlpha);
}
`;

type ShieldFieldLayerProps = Required<
  Pick<
    ShieldFieldProps,
    | "cell"
    | "lattice"
    | "lineOpacity"
    | "color"
    | "glow"
    | "waveSpeed"
    | "waveWidth"
    | "waveLife"
    | "maxWaves"
    | "refraction"
    | "hover"
  >
>;

/**
 * The GL layer. Owns the context, the program, the texture, the wave pool,
 * and the frame loop; reads everything else from the surface.
 */
function ShieldFieldLayer({
  cell,
  lattice,
  lineOpacity,
  color,
  glow,
  waveSpeed,
  waveWidth,
  waveLife,
  maxWaves,
  refraction,
  hover,
}: ShieldFieldLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const drawFrameRef = React.useRef<((tick: number) => void) | null>(null);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    cell,
    lattice,
    lineOpacity,
    glow,
    waveSpeed,
    waveWidth,
    waveLife,
    maxWaves,
    refraction,
    hover,
  });
  React.useEffect(() => {
    paramsRef.current = {
      cell,
      lattice,
      lineOpacity,
      glow,
      waveSpeed,
      waveWidth,
      waveLife,
      maxWaves,
      refraction,
      hover,
    };
  });

  const colorRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);

  // Fixed wave pool (struct-of-arrays, never React state) — `cursor` round-
  // robins so a burst of clicks recycles the oldest wave rather than
  // dropping the newest. `born` is the rAF tick (ms) the wave was pushed.
  const wavesRef = React.useRef({
    x: new Float32Array(MAX_WAVES),
    y: new Float32Array(MAX_WAVES),
    born: new Float32Array(MAX_WAVES).fill(-1e6),
    cursor: 0,
  });
  const wavesUniformRef = React.useRef(new Float32Array(MAX_WAVES * 4));
  const pointerRef = React.useRef({ x: -99999, y: -99999, inside: false });
  // Latest rAF timestamp the loop has observed — never Date.now(); read by
  // the pointerdown handler so a pushed wave is born on the same clock the
  // loop ages waves against.
  const tickRef = React.useRef(0);

  // Coalescing scheduler. Stable identity (empty deps) so the GL setup
  // effect below only re-runs when `surface.active` flips — it calls
  // through `drawFrameRef` rather than closing over `drawFrame` directly,
  // which is what lets a continuous, self-rescheduling loop avoid becoming
  // a self-referential callback.
  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame((tick) => {
      frameRef.current = null;
      drawFrameRef.current?.(tick);
    });
  }, []);

  // One frame: upload the texture if a new paint landed, age the wave pool,
  // draw, then — only while a wave is still alive or the pointer is inside
  // the field — ask for the next frame. The loop stops on its own the
  // moment neither is true.
  const drawFrame = React.useCallback(
    (tick: number) => {
      tickRef.current = tick;
      const gl = glRef.current;
      const program = programRef.current;
      const tri = triRef.current;
      const canvas = canvasRef.current;
      const live = surfaceRef.current;
      if (!gl || !program || !tri || !canvas || !live.canvas) return;
      if (gl.isContextLost()) return;

      if (uploadedVersionRef.current !== live.version) {
        textureRef.current = uploadTexture(
          gl,
          live.canvas,
          { linear: true, wrap: "clamp" },
          textureRef.current,
        );
        uploadedVersionRef.current = live.version;
      }
      const texture = textureRef.current;
      if (!texture) return;

      const size = resizeGL(gl, canvas, { dprCap: 2 });
      const cssW = size.width / size.dpr;
      const cssH = size.height / size.dpr;
      const p = paramsRef.current;
      const still = !live.motionSafe;

      const waves = wavesRef.current;
      const uniformArray = wavesUniformRef.current;
      let anyAlive = false;
      for (let i = 0; i < MAX_WAVES; i += 1) {
        const born = waves.born[i] ?? -1e6;
        const age = (tick - born) / 1000;
        const alive = !still && age >= 0 && age <= p.waveLife;
        if (alive) anyAlive = true;
        const o = i * 4;
        uniformArray[o] = waves.x[i] ?? 0;
        uniformArray[o + 1] = waves.y[i] ?? 0;
        uniformArray[o + 2] = alive ? age : 0;
        uniformArray[o + 3] = alive ? 1 : 0;
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_tex", texture, 0);
      program.set({
        u_res: [cssW, cssH],
        u_cell: p.cell,
        u_lattice: LATTICE_CODE[p.lattice],
        u_lineOpacity: p.lineOpacity,
        u_color: [
          colorRef.current[0],
          colorRef.current[1],
          colorRef.current[2],
        ],
        u_glow: p.glow,
        u_waveSpeed: p.waveSpeed,
        u_waveWidth: p.waveWidth,
        u_waveLife: p.waveLife,
        u_refraction: p.refraction,
        u_hover: p.hover,
        u_pointer: still
          ? [-99999, -99999]
          : [pointerRef.current.x, pointerRef.current.y],
        u_still: still ? 1 : 0,
        u_waves: uniformArray,
      });
      tri.draw();

      if (
        !still &&
        surfaceRef.current.active &&
        (anyAlive || pointerRef.current.inside)
      ) {
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
    uploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame, so the lattice and any bend
  // sample stay current with the live page.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colour resolves against the host so a `var(--token)` picks up the
  // theme in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: track position for the hover glow, push a wave on
  // pointerdown. Reduced motion leaves the listeners attached but inert —
  // no wave is ever pushed and the drawn frame never reads them.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = event.clientX - rect.left;
      pointerRef.current.y = event.clientY - rect.top;
    };
    const enter = (event: PointerEvent) => {
      move(event);
      pointerRef.current.inside = true;
      requestFrame();
    };
    const leave = () => {
      pointerRef.current.x = -99999;
      pointerRef.current.y = -99999;
      pointerRef.current.inside = false;
      requestFrame();
    };
    const down = (event: PointerEvent) => {
      if (!surfaceRef.current.motionSafe) return;
      const rect = host.getBoundingClientRect();
      const max = Math.min(
        MAX_WAVES,
        Math.max(1, Math.round(paramsRef.current.maxWaves)),
      );
      const waves = wavesRef.current;
      const i = waves.cursor;
      waves.x[i] = event.clientX - rect.left;
      waves.y[i] = event.clientY - rect.top;
      waves.born[i] = tickRef.current;
      waves.cursor = (i + 1) % max;
      requestFrame();
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointermove", move);
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
      data-effect-canvas="shield-field"
      className="block h-full w-full"
    />
  );
}

/**
 * A faint hex, tri, or square lattice laid over the interface that rings out
 * when clicked: a shockwave travels from the impact point, lighting each
 * cell's centre as the front sweeps past and bending the page a touch under
 * that front before fading, while cells near the pointer glow softly even
 * before a click lands. The canvas draws only the lattice and the waves —
 * everywhere else its alpha is zero — so a button underneath still gets the
 * real pointerdown and the ping is just a light show riding over it.
 * Reduced motion: the lattice sits still at rest, with no waves and no
 * pointer glow, and a click does nothing.
 */
export function ShieldField({
  cell = 28,
  lattice = "hex",
  lineOpacity = 0.35,
  color = "var(--primary)",
  glow = 1.4,
  waveSpeed = 700,
  waveWidth = 90,
  waveLife = 1.6,
  maxWaves = 6,
  refraction = 6,
  hover = 90,
  paint,
  className,
  children,
}: ShieldFieldProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={className}
      effect={
        <ShieldFieldLayer
          cell={cell}
          lattice={lattice}
          lineOpacity={lineOpacity}
          color={color}
          glow={glow}
          waveSpeed={waveSpeed}
          waveWidth={waveWidth}
          waveLife={waveLife}
          maxWaves={maxWaves}
          refraction={refraction}
          hover={hover}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
