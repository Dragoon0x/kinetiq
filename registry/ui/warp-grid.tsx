"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  createEmptyTexture,
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

export type WarpGridProps = {
  /** Grid columns. @default 28 */
  cols?: number;
  /** Grid rows. @default 18 */
  rows?: number;
  /** Multiplier on the pointer's own velocity when it feeds an impulse into nearby cells. @default 1 */
  strength?: number;
  /** Influence radius around the pointer, in CSS px. @default 140 */
  radius?: number;
  /** Maximum per-axis cell offset, in CSS px. @default 60 */
  maxShift?: number;
  /** Spring stiffness pulling each cell back toward rest. @default 0.12 */
  stiffness?: number;
  /** Per-frame velocity damping (0..1). @default 0.86 */
  damping?: number;
  /** Chromatic-fringe strength where a cell is sheared (0..1). @default 0.35 */
  aberration?: number;
  /** Resting grid-line opacity (0..1). @default 0.08 */
  lines?: number;
  /** Grid-line colour, any CSS colour (tokens included). @default "var(--ink)" */
  lineColor?: string;
  /** Fill for regions where the painted texture is transparent. Defaults to the host's own effective background, like CrystalLens. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform sampler2D u_field;
uniform vec2 u_res;
uniform vec2 u_grid;
uniform float u_maxShift;
uniform float u_aberration;
uniform float u_lines;
uniform vec4 u_lineColor;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 enc = texture(u_field, v_uv).rg;
  vec2 d = (enc - 0.5) * 2.0 * u_maxShift;
  float shear = length(d) / max(u_maxShift, 0.0001);
  vec2 dpx = d / u_res;

  // Chromatic split only where the field is actually sheared: red and blue
  // sample increasingly off the green (undistorted-by-aberration) point as
  // |d| grows, so a still cell stays a single clean colour.
  vec2 uvR = v_uv - dpx * (1.0 + u_aberration * shear);
  vec2 uvG = v_uv - dpx;
  vec2 uvB = v_uv - dpx * (1.0 - u_aberration * shear);

  vec3 color = vec3(
    sampleOver(uvR).r,
    sampleOver(uvG).g,
    sampleOver(uvB).b
  );

  // Cell boundaries traced in the same displaced space as the colour
  // sample, so the lattice shears together with the cells it outlines.
  vec2 cellPx = u_res / u_grid;
  vec2 gridUv = fract(uvG * u_grid);
  vec2 distPx = min(gridUv, 1.0 - gridUv) * cellPx;
  float lineMask = 1.0 - smoothstep(0.0, 0.6, min(distPx.x, distPx.y));

  color = mix(color, u_lineColor.rgb, lineMask * u_lines * u_lineColor.a);
  o_color = vec4(color, 1.0);
}
`;

type Field = {
  cols: number;
  rows: number;
  /** Offset and velocity, per axis, one entry per cell (row-major). */
  ox: Float32Array;
  oy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** RGBA8, re-encoded from ox/oy every simulation step; uploaded as-is. */
  pixels: Uint8Array;
};

/** Below this, the field is close enough to rest that another frame would be imperceptible — the simulation stops rather than idling forever. */
const ENERGY_STOP = 0.05;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

/** A fresh cols×rows field, at rest: zero offset and velocity everywhere, pixels pre-encoded so the first upload is already correct. */
function createField(cols: number, rows: number): Field {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const n = c * r;
  const pixels = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    pixels[p] = 128;
    pixels[p + 1] = 128;
    pixels[p + 2] = 0;
    pixels[p + 3] = 255;
  }
  return {
    cols: c,
    rows: r,
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    pixels,
  };
}

/** Adds `velocity * strength * falloff` to every cell within `radius` CSS px of (px, py); falloff is a smoothstep-shaped taper, 1 at the centre and 0 at the rim. */
function applyImpulse(
  field: Field,
  px: number,
  py: number,
  ivx: number,
  ivy: number,
  radius: number,
  strength: number,
  cellW: number,
  cellH: number,
): void {
  if (radius <= 0) return;
  const { cols, rows, vx, vy } = field;
  for (let row = 0; row < rows; row += 1) {
    const cy = (row + 0.5) * cellH;
    const dy = cy - py;
    if (Math.abs(dy) > radius) continue;
    for (let col = 0; col < cols; col += 1) {
      const cx = (col + 0.5) * cellW;
      const dx = cx - px;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= radius) continue;
      const t = dist / radius;
      const falloff = 1 - t * t * (3 - 2 * t);
      const i = row * cols + col;
      vx[i] = (vx[i] ?? 0) + ivx * strength * falloff;
      vy[i] = (vy[i] ?? 0) + ivy * strength * falloff;
    }
  }
}

/**
 * One simulation step for every cell: `v = (v - o * stiffness) * damping;
 * o += v;`, each axis of `o` clamped to `maxShift`. Re-encodes `pixels` from
 * the new offsets in the same pass. Returns the field's energy — the
 * largest `|v| + |o|` over all cells — so the caller knows whether another
 * frame is worth drawing.
 */
function integrateField(
  field: Field,
  stiffness: number,
  damping: number,
  maxShift: number,
): number {
  const { cols, rows, ox, oy, vx, vy, pixels } = field;
  const n = cols * rows;
  const shift = maxShift > 0 ? maxShift : 1;
  let energy = 0;
  for (let i = 0; i < n; i += 1) {
    const px0 = ox[i] ?? 0;
    const py0 = oy[i] ?? 0;
    const nvx = ((vx[i] ?? 0) - px0 * stiffness) * damping;
    const nvy = ((vy[i] ?? 0) - py0 * stiffness) * damping;
    const nox = clamp(px0 + nvx, -maxShift, maxShift);
    const noy = clamp(py0 + nvy, -maxShift, maxShift);
    vx[i] = nvx;
    vy[i] = nvy;
    ox[i] = nox;
    oy[i] = noy;
    const cellEnergy =
      Math.sqrt(nvx * nvx + nvy * nvy) + Math.sqrt(nox * nox + noy * noy);
    if (cellEnergy > energy) energy = cellEnergy;
    const p = i * 4;
    pixels[p] = clampByte(((nox / shift) * 0.5 + 0.5) * 255);
    pixels[p + 1] = clampByte(((noy / shift) * 0.5 + 0.5) * 255);
  }
  return energy;
}

/** Walks up from the host to the first opaque background colour — the same fallback crystal-lens uses so a fully transparent painted texture composites onto the page rather than onto black. */
function effectiveBackground(
  el: HTMLElement | null,
): [number, number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg);
    if (rgba[3] > 0.01) return rgba;
    node = node.parentElement;
  }
  return resolveColor(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--background",
    ) || "#fff",
    document.documentElement,
  );
}

type GridLayerProps = Required<
  Pick<
    WarpGridProps,
    | "cols"
    | "rows"
    | "strength"
    | "radius"
    | "maxShift"
    | "stiffness"
    | "damping"
    | "aberration"
    | "lines"
    | "lineColor"
  >
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the two textures (the
 * painted DOM and the small field), the CPU field simulation, and the
 * frame loop; reads everything else from the surface.
 */
function GridLayer({
  cols,
  rows,
  strength,
  radius,
  maxShift,
  stiffness,
  damping,
  aberration,
  lines,
  lineColor,
  background,
}: GridLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const fieldTextureRef = React.useRef<WebGLTexture | null>(null);
  const fieldVersionRef = React.useRef(0);
  const uploadedFieldVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const simFrameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const lineColorRef = React.useRef<[number, number, number, number]>([
    0, 0, 0, 1,
  ]);
  const failedRef = React.useRef(false);

  const fieldRef = React.useRef<Field | null>(null);
  // Simulation-frame counter (never wall-clock) — pointer velocity is a
  // position delta divided by the number of ticks since the last event.
  const tickRef = React.useRef(0);
  const lastPointerRef = React.useRef<{
    x: number;
    y: number;
    tick: number;
  } | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    strength,
    radius,
    maxShift,
    stiffness,
    damping,
    aberration,
    lines,
  });
  React.useEffect(() => {
    paramsRef.current = {
      strength,
      radius,
      maxShift,
      stiffness,
      damping,
      aberration,
      lines,
    };
  });

  // One frame: upload whichever texture landed a new version, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const fieldTexture = fieldTextureRef.current;
    const live = surfaceRef.current;
    if (
      !gl ||
      !program ||
      !tri ||
      !canvas ||
      !live.canvas ||
      !field ||
      !fieldTexture
    ) {
      return;
    }
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

    if (uploadedFieldVersionRef.current !== fieldVersionRef.current) {
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        field.cols,
        field.rows,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        field.pixels,
      );
      uploadedFieldVersionRef.current = fieldVersionRef.current;
    }

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_field", fieldTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_grid: [field.cols, field.rows],
      u_maxShift: p.maxShift,
      u_aberration: p.aberration,
      u_lines: p.lines,
      u_lineColor: lineColorRef.current,
      u_bg: bgRef.current,
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
    uploadedVersionRef.current = 0;
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
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
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

  // The field and its texture are sized from cols×rows, so they're set up
  // (and torn down) independently of the base GL setup above — changing
  // cols/rows must not recompile the program, only reallocate the field.
  React.useEffect(() => {
    if (!surface.active) return;
    const gl = glRef.current;
    if (!gl || failedRef.current) return;
    const field = createField(cols, rows);
    const texture = createEmptyTexture(gl, field.cols, field.rows);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      field.cols,
      field.rows,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      field.pixels,
    );
    fieldRef.current = field;
    fieldTextureRef.current = texture;
    fieldVersionRef.current = 1;
    uploadedFieldVersionRef.current = 0;
    requestFrame();

    return () => {
      gl.deleteTexture(texture);
      fieldTextureRef.current = null;
      fieldRef.current = null;
    };
  }, [surface.active, cols, rows, requestFrame]);

  // Every completed paint asks for a frame, even while the grid is at rest.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours are resolved against the host once it exists, and again if the
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    lineColorRef.current = resolveColor(lineColor, host);
    requestFrame();
  }, [surface.host, background, lineColor, requestFrame]);

  // Pointer on the host: every move turns its own delta-over-ticks into a
  // velocity, pushes that into nearby cells, and (re)starts the simulation
  // loop. The loop steps the field, asks for a redraw, and reschedules
  // itself only while there's still energy left to settle.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const stepSimulation = () => {
      simFrameRef.current = null;
      const live = surfaceRef.current;
      const field = fieldRef.current;
      if (!live.active || !field) return;
      tickRef.current += 1;
      const p = paramsRef.current;
      const energy = integrateField(field, p.stiffness, p.damping, p.maxShift);
      fieldVersionRef.current += 1;
      requestFrame();
      if (energy > ENERGY_STOP) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const field = fieldRef.current;
      const last = lastPointerRef.current;
      if (field && last) {
        const frames = Math.max(1, tickRef.current - last.tick);
        const ivx = (px - last.x) / frames;
        const ivy = (py - last.y) / frames;
        const p = paramsRef.current;
        applyImpulse(
          field,
          px,
          py,
          ivx,
          ivy,
          p.radius,
          p.strength,
          rect.width / field.cols,
          rect.height / field.rows,
        );
      }
      lastPointerRef.current = { x: px, y: py, tick: tickRef.current };
      if (simFrameRef.current === null) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };
    const reset = () => {
      lastPointerRef.current = null;
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", reset);
    host.addEventListener("pointercancel", reset);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", reset);
      host.removeEventListener("pointercancel", reset);
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="warp-grid"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a grid of cells riding springs. A CPU simulation at
 * `cols` × `rows` resolution reads the pointer's velocity, not its
 * position — a slow sweep barely nudges the springs and the page holds
 * still, while a fast flick shoves nearby cells hard enough that they
 * shear, their edges splitting into colour as the shader samples the
 * painted texture off-centre per channel. Every cell then relaxes on its
 * own spring (`stiffness`, `damping`) until the field's energy drops low
 * enough that the simulation stops itself, waking again only on the next
 * pointer move. The field lives entirely in refs as small Float32Arrays and
 * reaches the shader as a `cols` × `rows` texture, so simulation cost stays
 * independent of how much DOM the surface paints.
 * Reduced motion: `SurfacePaint` renders in replace mode, so the layer
 * returns null and the real, undistorted DOM shows in its place.
 */
export function WarpGrid({
  cols = 28,
  rows = 18,
  strength = 1,
  radius = 140,
  maxShift = 60,
  stiffness = 0.12,
  damping = 0.86,
  aberration = 0.35,
  lines = 0.08,
  lineColor = "var(--ink)",
  background,
  paint,
  className,
  children,
}: WarpGridProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <GridLayer
          cols={cols}
          rows={rows}
          strength={strength}
          radius={radius}
          maxShift={maxShift}
          stiffness={stiffness}
          damping={damping}
          aberration={aberration}
          lines={lines}
          lineColor={lineColor}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
