"use client";

import * as React from "react";

import {
  createEmptyTexture,
  createGL,
  createGridMesh,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type GLContext,
  type Mesh,
  type Program,
} from "@/registry/lib/glsl";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type WobbleJellyProps = {
  /** Mesh columns. @default 28 */
  cols?: number;
  /** Mesh rows. @default 18 */
  rows?: number;
  /** Spring stiffness pulling every vertex back toward rest. @default 0.08 */
  stiffness?: number;
  /** Per-frame velocity damping (0..1). @default 0.9 */
  damping?: number;
  /** Multiplier on a poke's impulse strength. @default 1 */
  poke?: number;
  /** Fill for regions where the painted texture is transparent. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// The field reaches this vertex shader as a (cols+1)x(rows+1) texture, one
// texel per mesh vertex; a_cell already carries that vertex's integer (col,
// row), so texelFetch needs no scaling or floor(). The decoded offset moves
// the vertex in CSS px, converted to a clip-space delta (y flipped, since
// clip y runs bottom-up and CSS y runs top-down); its magnitude also lifts
// the vertex along z for a faint perspective divide, so a hard poke bulges
// toward the viewer instead of only sliding sideways.
const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
in vec2 a_cell;

uniform sampler2D u_field;
uniform vec2 u_res;

out vec2 v_uv;
out float v_mag;

const float OFFSET_RANGE = 100.0;
const float Z_SCALE = 0.5;
const float PERSPECTIVE = 1200.0;

void main() {
  ivec2 cell = ivec2(a_cell);
  vec4 enc = texelFetch(u_field, cell, 0);
  vec2 offsetPx = (enc.rg - 0.5) * 2.0 * OFFSET_RANGE;

  vec2 clipOffset = vec2(
    2.0 * offsetPx.x / u_res.x,
    -2.0 * offsetPx.y / u_res.y
  );
  vec2 pos = a_position + clipOffset;

  float mag = length(offsetPx);
  float z = mag * Z_SCALE;
  float persp = 1.0 + z / PERSPECTIVE;
  gl_Position = vec4(pos / persp, 0.0, 1.0);

  v_uv = a_uv;
  v_mag = mag;
}
`;

// A glossy read on the same field the vertex shader already decoded: the
// screen-space gradient of v_mag (dFdx/dFdy of a value the GPU already has,
// no second simulation pass) stands in for how sharply the slab bends at
// each pixel, which doubles as both a specular catch and a faint shadow
// where the material reads as compressed.
const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec4 u_bg;
in vec2 v_uv;
in float v_mag;
out vec4 o_color;

void main() {
  vec4 t = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  vec3 color = mix(u_bg.rgb, t.rgb, t.a);

  // A faint cool tint, the way light picks up inside clear jelly.
  color = mix(color, vec3(0.8745, 0.9529, 1.0), 0.06);

  float gx = dFdx(v_mag);
  float gy = dFdy(v_mag);
  float gradMag = length(vec2(gx, gy));
  float spec = smoothstep(0.15, 1.4, gradMag) * 0.4;
  float compress = smoothstep(0.05, 0.7, gradMag);
  color += spec;
  color *= mix(1.0, 0.88, compress * 0.5);

  o_color = vec4(color, 1.0);
}
`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

/** Below this, the field is close enough to rest that another frame would be imperceptible — the simulation stops rather than idling forever. */
const ENERGY_STOP = 0.05;

// Must match VERTEX's OFFSET_RANGE above — the byte encoding below and the
// shader's decode share this range by convention, not a uniform.
const OFFSET_RANGE = 100;
/** Radius of a poke's outward impulse, in CSS px, per the device spec. */
const POKE_RADIUS_PX = 160;
/** Base outward impulse per unit of the `poke` prop, before falloff. */
const POKE_IMPULSE = 22;
/** Base inward follow-through impulse, applied one simulation step after the poke — smaller, so it reads as a settle rather than cancelling the poke outright. */
const PULL_IMPULSE = 9;
/** Weight on the neighbour-averaging term below, before the 0.35 mix — a documented constant, not a prop, so any retuning stays in one place. */
const NEIGHBOR_COUPLING = 1;

type Field = {
  /** Mesh columns/rows (quad counts), matching the `cols`/`rows` props. */
  cols: number;
  rows: number;
  /** Vertex grid size: cols+1 by rows+1, one entry per mesh vertex. */
  vertsX: number;
  vertsY: number;
  ox: Float32Array;
  oy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Snapshot of ox/oy taken at the start of each step, so neighbour
   * averaging reads last step's state rather than a mix of updated and
   * stale values from earlier in the same pass. */
  oxPrev: Float32Array;
  oyPrev: Float32Array;
  /** RGBA8, re-encoded from ox/oy every simulation step; uploaded as-is. */
  pixels: Uint8Array;
};

/** A fresh (cols+1)x(rows+1) field, at rest: zero offset and velocity everywhere, pixels pre-encoded so the first upload is already correct. */
function createField(cols: number, rows: number): Field {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const vertsX = c + 1;
  const vertsY = r + 1;
  const n = vertsX * vertsY;
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
    vertsX,
    vertsY,
    ox: new Float32Array(n),
    oy: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    oxPrev: new Float32Array(n),
    oyPrev: new Float32Array(n),
    pixels,
  };
}

/** Adds a radial impulse — outward for `sign` 1, inward for `sign` -1 — to every vertex within `POKE_RADIUS_PX` of (px, py); falloff is a smoothstep taper, 1 at the centre and 0 at the rim. */
function applyPoke(
  field: Field,
  px: number,
  py: number,
  sign: number,
  magnitude: number,
  poke: number,
  cellW: number,
  cellH: number,
): void {
  if (poke === 0 || magnitude === 0) return;
  const { vertsX, vertsY, vx, vy } = field;
  for (let row = 0; row < vertsY; row += 1) {
    const y = row * cellH;
    const dy = y - py;
    if (Math.abs(dy) > POKE_RADIUS_PX) continue;
    for (let col = 0; col < vertsX; col += 1) {
      const x = col * cellW;
      const dx = x - px;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist >= POKE_RADIUS_PX) continue;
      const t = dist / POKE_RADIUS_PX;
      const falloff = 1 - t * t * (3 - 2 * t);
      const dirX = dist > 0 ? dx / dist : 0;
      const dirY = dist > 0 ? dy / dist : 0;
      const i = row * vertsX + col;
      const impulse = magnitude * poke * falloff * sign;
      vx[i] = (vx[i] ?? 0) + dirX * impulse;
      vy[i] = (vy[i] ?? 0) + dirY * impulse;
    }
  }
}

/**
 * One simulation step for every vertex: `v += (0 - o) * stiffness +
 * NEIGHBOR_COUPLING * (avgNeighbour - o) * 0.35; v *= damping; o += v`, each
 * axis of `o` clamped to `OFFSET_RANGE`. The neighbour average reads a
 * snapshot taken at the top of the step (oxPrev/oyPrev), not the arrays
 * being written this same pass, so coupling stays symmetric rather than
 * favouring whichever vertex happens to be visited first. Edge vertices
 * substitute themselves for a missing neighbour rather than wrapping.
 * Re-encodes `pixels` in the same pass. Returns the field's energy — the
 * largest `|v| + |o|` over all vertices — so the caller knows whether
 * another frame is worth drawing.
 */
function stepField(field: Field, stiffness: number, damping: number): number {
  const { vertsX, vertsY, ox, oy, vx, vy, oxPrev, oyPrev, pixels } = field;
  oxPrev.set(ox);
  oyPrev.set(oy);

  let energy = 0;
  for (let row = 0; row < vertsY; row += 1) {
    for (let col = 0; col < vertsX; col += 1) {
      const i = row * vertsX + col;
      const ox0 = oxPrev[i] ?? 0;
      const oy0 = oyPrev[i] ?? 0;

      const up = row > 0 ? i - vertsX : i;
      const down = row < vertsY - 1 ? i + vertsX : i;
      const left = col > 0 ? i - 1 : i;
      const right = col < vertsX - 1 ? i + 1 : i;
      const avgNX =
        ((oxPrev[up] ?? 0) +
          (oxPrev[down] ?? 0) +
          (oxPrev[left] ?? 0) +
          (oxPrev[right] ?? 0)) /
        4;
      const avgNY =
        ((oyPrev[up] ?? 0) +
          (oyPrev[down] ?? 0) +
          (oyPrev[left] ?? 0) +
          (oyPrev[right] ?? 0)) /
        4;

      const nvx =
        ((vx[i] ?? 0) +
          -ox0 * stiffness +
          NEIGHBOR_COUPLING * (avgNX - ox0) * 0.35) *
        damping;
      const nvy =
        ((vy[i] ?? 0) +
          -oy0 * stiffness +
          NEIGHBOR_COUPLING * (avgNY - oy0) * 0.35) *
        damping;
      const nox = clamp(ox0 + nvx, -OFFSET_RANGE, OFFSET_RANGE);
      const noy = clamp(oy0 + nvy, -OFFSET_RANGE, OFFSET_RANGE);

      vx[i] = nvx;
      vy[i] = nvy;
      ox[i] = nox;
      oy[i] = noy;

      const cellEnergy =
        Math.sqrt(nvx * nvx + nvy * nvy) + Math.sqrt(nox * nox + noy * noy);
      if (cellEnergy > energy) energy = cellEnergy;

      const p = i * 4;
      pixels[p] = clampByte(((nox / OFFSET_RANGE) * 0.5 + 0.5) * 255);
      pixels[p + 1] = clampByte(((noy / OFFSET_RANGE) * 0.5 + 0.5) * 255);
      pixels[p + 2] = 0;
      pixels[p + 3] = 255;
    }
  }
  return energy;
}

/** Walks up from the host to the first opaque background colour — the same fallback tile-wave and cloth-drape use so a fully transparent painted texture composites onto the page rather than onto black. */
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

/** A poke queued to land one simulation step after the outward impulse. */
type PendingPull = {
  x: number;
  y: number;
  poke: number;
  framesUntil: number;
};

type JellyLayerProps = Required<
  Pick<WobbleJellyProps, "cols" | "rows" | "stiffness" | "damping" | "poke">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the grid mesh, the two
 * textures (the painted DOM and the small field), the CPU field simulation,
 * and the frame loop; reads everything else from the surface.
 */
function JellyLayer({
  cols,
  rows,
  stiffness,
  damping,
  poke,
  background,
}: JellyLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const meshRef = React.useRef<Mesh | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const fieldTextureRef = React.useRef<WebGLTexture | null>(null);
  const fieldVersionRef = React.useRef(0);
  const uploadedFieldVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const simFrameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const fieldRef = React.useRef<Field | null>(null);
  const pendingPullRef = React.useRef<PendingPull[]>([]);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ stiffness, damping, poke });
  React.useEffect(() => {
    paramsRef.current = { stiffness, damping, poke };
  });

  // One frame: upload whichever texture landed a new version, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const mesh = meshRef.current;
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const fieldTexture = fieldTextureRef.current;
    const live = surfaceRef.current;
    if (
      !gl ||
      !program ||
      !mesh ||
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
        field.vertsX,
        field.vertsY,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        field.pixels,
      );
      uploadedFieldVersionRef.current = fieldVersionRef.current;
    }

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const bg = bgRef.current;
    // The mesh's perspective divide can pull edge vertices in from the
    // canvas border, so the clear colour — not a transparent clear — is
    // the effect's background, unlike the overlay-mode effects nearby.
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_field", fieldTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_bg: bg,
    });
    mesh.draw();
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
    const program = createProgram(gl, VERTEX, FRAGMENT);
    if (!program) {
      failedRef.current = true;
      return;
    }
    glRef.current = gl;
    programRef.current = program;
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
    // poke.
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
      program.dispose();
      glRef.current = null;
      programRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The field and the grid mesh are both sized from cols×rows, so they're
  // set up — and torn down — independently of the base GL setup above;
  // changing cols/rows must not recompile the program, only reallocate the
  // field and rebuild the geometry.
  React.useEffect(() => {
    if (!surface.active) return;
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program || failedRef.current) return;
    const field = createField(cols, rows);
    const texture = createEmptyTexture(gl, field.vertsX, field.vertsY);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      field.vertsX,
      field.vertsY,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      field.pixels,
    );
    const mesh = createGridMesh(gl, program, field.cols, field.rows);

    fieldRef.current = field;
    fieldTextureRef.current = texture;
    fieldVersionRef.current = 1;
    uploadedFieldVersionRef.current = 0;
    meshRef.current = mesh;
    pendingPullRef.current = [];
    requestFrame();

    return () => {
      gl.deleteTexture(texture);
      fieldTextureRef.current = null;
      fieldRef.current = null;
      mesh.dispose();
      meshRef.current = null;
    };
  }, [surface.active, cols, rows, requestFrame]);

  // Every completed paint asks for a frame, even while the slab is at rest.
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
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // A pointerdown on the host is the whole driver: it injects the outward
  // poke immediately, queues a smaller inward pull for the step after, and
  // (re)starts a loop that steps the field, asks for a redraw, and
  // reschedules itself only while there's still energy left to settle.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const stepSimulation = () => {
      simFrameRef.current = null;
      const live = surfaceRef.current;
      const field = fieldRef.current;
      if (!live.active || !field) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const cellW = rect.width / field.cols;
      const cellH = rect.height / field.rows;

      const still: PendingPull[] = [];
      for (const pull of pendingPullRef.current) {
        if (pull.framesUntil > 0) {
          still.push({ ...pull, framesUntil: pull.framesUntil - 1 });
        } else {
          applyPoke(
            field,
            pull.x,
            pull.y,
            -1,
            PULL_IMPULSE,
            pull.poke,
            cellW,
            cellH,
          );
        }
      }
      pendingPullRef.current = still;

      const p = paramsRef.current;
      const energy = stepField(field, p.stiffness, p.damping);
      fieldVersionRef.current += 1;
      requestFrame();
      if (energy > ENERGY_STOP || pendingPullRef.current.length > 0) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };

    const ensureLoop = () => {
      if (simFrameRef.current === null) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const field = fieldRef.current;
      if (!field) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const cellW = rect.width / field.cols;
      const cellH = rect.height / field.rows;
      const p = paramsRef.current;
      applyPoke(field, x, y, 1, POKE_IMPULSE, p.poke, cellW, cellH);
      pendingPullRef.current = [
        ...pendingPullRef.current,
        { x, y, poke: p.poke, framesUntil: 1 },
      ];
      ensureLoop();
    };

    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointerdown", down);
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="wobble-jelly"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a slab of jelly. A `cols` × `rows` mesh of vertices, each
 * carrying its own offset and velocity on the CPU, springs back toward rest
 * at `stiffness` and blends with its four neighbours so a poke ripples
 * outward as connected material rather than a scatter of independent
 * points. A pointerdown injects a radial outward impulse across a 160px
 * falloff, scaled by `poke`; one simulation step later a smaller inward
 * pull lands at the same point, the two together reading as a poke rather
 * than a shove. The field reaches the vertex shader as a small
 * `(cols+1)` × `(rows+1)` texture, one texel per vertex, decoded into a
 * CSS-pixel offset and a lift along z for a faint perspective divide; the
 * fragment shader tints the result toward a cool #dff3ff and reads a
 * specular catch and a faint compression shadow off the screen-space
 * gradient of that same offset. The simulation runs only while the slab
 * still has energy, then stops itself until the next poke.
 * Reduced motion: `SurfacePaint` renders in replace mode, so the layer
 * returns null and the real, undistorted DOM shows in its place.
 */
export function WobbleJelly({
  cols = 28,
  rows = 18,
  stiffness = 0.08,
  damping = 0.9,
  poke = 1,
  background,
  paint,
  className,
  children,
}: WobbleJellyProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <JellyLayer
          cols={cols}
          rows={rows}
          stiffness={stiffness}
          damping={damping}
          poke={poke}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
