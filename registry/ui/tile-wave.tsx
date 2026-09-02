"use client";

import * as React from "react";

import {
  createEmptyTexture,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type TileWaveProps = {
  /** Grid columns. @default 16 */
  cols?: number;
  /** Grid rows. @default 10 */
  rows?: number;
  /** Gap between tiles, in CSS px — the ground shows through it. @default 2 */
  gap?: number;
  /** Peak tilt at the pointer's centre, in degrees. @default 22 */
  tilt?: number;
  /** Peak lift at the pointer's centre, in CSS px. @default 14 */
  lift?: number;
  /** Influence radius around the pointer, in CSS px. @default 180 */
  radius?: number;
  /** Spring stiffness pulling tiltX/tiltY/lift toward their target. @default 0.14 */
  stiffness?: number;
  /** Per-frame velocity damping (0..1). @default 0.82 */
  damping?: number;
  /** Multiplier on a click ring's lift impulse and tilt kick. @default 1 */
  ring?: number;
  /** Fill for the gaps and any transparent texture region. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// A custom vertex shader over per-tile quads (see createTileMesh): each
// corner is rotated about its own tile's centre by the tiltX/tiltY/lift read
// from the field texture, then faux-perspective scaled, before landing in
// clip space. TILT_RANGE/LIFT_RANGE mirror the JS-side encode range below —
// keep the two in sync by hand if either changes.
const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
in vec2 a_center;

uniform sampler2D u_field;
uniform vec2 u_res;
uniform vec2 u_grid;

out vec2 v_uv;
out float v_shade;

const float TILT_RANGE = 60.0;
const float LIFT_RANGE = 80.0;
const float PERSPECTIVE = 900.0;

void main() {
  ivec2 gridSize = ivec2(u_grid);
  ivec2 cell = clamp(ivec2(floor(a_center * u_grid)), ivec2(0), gridSize - ivec2(1));
  vec4 enc = texelFetch(u_field, cell, 0);
  float tiltX = (enc.r - 0.5) * 2.0 * TILT_RANGE;
  float tiltY = (enc.g - 0.5) * 2.0 * TILT_RANGE;
  float lift = (enc.b - 0.5) * 2.0 * LIFT_RANGE;

  vec2 centerPx = a_center * u_res;
  vec3 p = vec3(a_position * u_res - centerPx, 0.0);

  // Small-angle-free 3D rotation about the tile's own centre: pitch (tiltX)
  // about the horizontal axis, then yaw (tiltY) about the vertical axis.
  float radX = radians(tiltX);
  float cx = cos(radX);
  float sx = sin(radX);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);

  float radY = radians(tiltY);
  float cy = cos(radY);
  float sy = sin(radY);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);

  p.z += lift;

  float persp = 1.0 + p.z / PERSPECTIVE;
  vec2 screenPx = centerPx + p.xy * persp;
  vec2 clipUv = screenPx / u_res;
  gl_Position = vec4(clipUv.x * 2.0 - 1.0, 1.0 - clipUv.y * 2.0, 0.0, 1.0);

  vec3 n = vec3(0.0, 0.0, 1.0);
  n = vec3(n.x, n.y * cx - n.z * sx, n.y * sx + n.z * cx);
  n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  vec3 light = normalize(vec3(-0.35, -0.55, 0.76));
  v_shade = clamp(dot(normalize(n), light), 0.0, 1.0);

  v_uv = a_uv;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec4 u_bg;
in vec2 v_uv;
in float v_shade;
out vec4 o_color;

void main() {
  vec4 t = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  vec3 color = mix(u_bg.rgb, t.rgb, t.a);
  float shade = mix(0.62, 1.12, v_shade);
  o_color = vec4(color * shade, 1.0);
}
`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

function mustCreate<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(`tile-wave: failed to allocate ${what} (context lost?)`);
  }
  return value;
}

// Must match VERTEX's TILT_RANGE/LIFT_RANGE above — the byte encoding below
// and the shader's decode share this range by convention, not a uniform.
const TILT_RANGE = 60;
const LIFT_RANGE = 80;
/** 900px/s at an assumed 60fps simulation step — never wall-clock. */
const RING_SPEED_PX = 15;
/** Per unit of the `ring` prop, added straight to a crossed tile's lift velocity. */
const RING_LIFT_PX = 30;
/** Per unit of the `ring` prop and the `tilt` prop, added to a crossed tile's tilt velocity. */
const RING_TILT_FACTOR = 0.5;
/** Below this, the field is close enough to rest that another frame would be imperceptible. */
const ENERGY_STOP = 0.05;

type Field = {
  cols: number;
  rows: number;
  tiltX: Float32Array;
  tiltY: Float32Array;
  lift: Float32Array;
  vTiltX: Float32Array;
  vTiltY: Float32Array;
  vLift: Float32Array;
  /** RGBA8, re-encoded from the six arrays above every simulation step. */
  pixels: Uint8Array;
};

/** A fresh cols×rows field, at rest — zero tilt, zero lift, pixels pre-encoded to the neutral texel so the first upload is already correct. */
function createField(cols: number, rows: number): Field {
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const n = c * r;
  const pixels = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    pixels[p] = 128;
    pixels[p + 1] = 128;
    pixels[p + 2] = 128;
    pixels[p + 3] = 255;
  }
  return {
    cols: c,
    rows: r,
    tiltX: new Float32Array(n),
    tiltY: new Float32Array(n),
    lift: new Float32Array(n),
    vTiltX: new Float32Array(n),
    vTiltY: new Float32Array(n),
    vLift: new Float32Array(n),
    pixels,
  };
}

type Ring = {
  x: number;
  y: number;
  radius: number;
  /** Distance to the host's farthest corner — once past it the ring has swept everything and is dropped. */
  maxRadius: number;
};

type SimParams = {
  tilt: number;
  lift: number;
  radius: number;
  stiffness: number;
  damping: number;
  ring: number;
};

/**
 * One simulation step. Every live ring grows by a fixed per-frame distance
 * and kicks the tiles its wavefront newly crosses (a lift-velocity impulse
 * of `ring × 30px`, a tilt-velocity kick scaled by `tilt × ring`, both
 * pointed radially outward from the click). Every tile then springs its
 * tiltX/tiltY/lift toward a pointer-derived target — zero when the pointer
 * is absent or past `radius` — via `v = (v + (target - x) * stiffness) *
 * damping`. Re-encodes `pixels` in the same pass. Returns the field's
 * energy (velocity plus distance-from-target, per tile, maxed) so the
 * caller knows whether another frame is worth drawing.
 */
function stepField(
  field: Field,
  rings: Ring[],
  pointer: { x: number; y: number } | null,
  p: SimParams,
  cellW: number,
  cellH: number,
): number {
  const { cols, rows, tiltX, tiltY, lift, vTiltX, vTiltY, vLift, pixels } =
    field;

  for (const r of rings) {
    const prevRadius = r.radius;
    const nextRadius = prevRadius + RING_SPEED_PX;
    if (p.ring !== 0) {
      for (let row = 0; row < rows; row += 1) {
        const cy = (row + 0.5) * cellH;
        for (let col = 0; col < cols; col += 1) {
          const cx = (col + 0.5) * cellW;
          const dist = Math.hypot(cx - r.x, cy - r.y);
          if (dist <= prevRadius || dist > nextRadius) continue;
          const i = row * cols + col;
          const dirX = dist > 0 ? (cx - r.x) / dist : 0;
          const dirY = dist > 0 ? (cy - r.y) / dist : 0;
          const kick = p.tilt * p.ring * RING_TILT_FACTOR;
          vLift[i] = (vLift[i] ?? 0) + p.ring * RING_LIFT_PX;
          vTiltX[i] = (vTiltX[i] ?? 0) + kick * dirY;
          vTiltY[i] = (vTiltY[i] ?? 0) - kick * dirX;
        }
      }
    }
    r.radius = nextRadius;
  }

  let energy = 0;
  for (let row = 0; row < rows; row += 1) {
    const cy = (row + 0.5) * cellH;
    for (let col = 0; col < cols; col += 1) {
      const cx = (col + 0.5) * cellW;
      const i = row * cols + col;

      let targetTiltX = 0;
      let targetTiltY = 0;
      let targetLift = 0;
      if (pointer && p.radius > 0) {
        const dx = pointer.x - cx;
        const dy = pointer.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < p.radius) {
          const t = dist / p.radius;
          const falloff = 1 - t * t * (3 - 2 * t);
          const dirX = dist > 0 ? dx / dist : 0;
          const dirY = dist > 0 ? dy / dist : 0;
          // The tile's edge nearer the pointer lifts, so the field reads as
          // a hill flank rising toward the cursor rather than a flat dent.
          targetTiltX = p.tilt * falloff * dirY;
          targetTiltY = -p.tilt * falloff * dirX;
          targetLift = p.lift * falloff;
        }
      }

      const tx0 = tiltX[i] ?? 0;
      const ty0 = tiltY[i] ?? 0;
      const l0 = lift[i] ?? 0;
      const nvx =
        ((vTiltX[i] ?? 0) + (targetTiltX - tx0) * p.stiffness) * p.damping;
      const nvy =
        ((vTiltY[i] ?? 0) + (targetTiltY - ty0) * p.stiffness) * p.damping;
      const nvl =
        ((vLift[i] ?? 0) + (targetLift - l0) * p.stiffness) * p.damping;

      const ntx = clamp(tx0 + nvx, -TILT_RANGE, TILT_RANGE);
      const nty = clamp(ty0 + nvy, -TILT_RANGE, TILT_RANGE);
      const nl = clamp(l0 + nvl, -LIFT_RANGE, LIFT_RANGE);

      vTiltX[i] = nvx;
      vTiltY[i] = nvy;
      vLift[i] = nvl;
      tiltX[i] = ntx;
      tiltY[i] = nty;
      lift[i] = nl;

      const cellEnergy =
        Math.abs(nvx) +
        Math.abs(nvy) +
        Math.abs(nvl) +
        Math.abs(targetTiltX - ntx) +
        Math.abs(targetTiltY - nty) +
        Math.abs(targetLift - nl);
      if (cellEnergy > energy) energy = cellEnergy;

      const px = i * 4;
      pixels[px] = clampByte(((ntx / TILT_RANGE) * 0.5 + 0.5) * 255);
      pixels[px + 1] = clampByte(((nty / TILT_RANGE) * 0.5 + 0.5) * 255);
      pixels[px + 2] = clampByte(((nl / LIFT_RANGE) * 0.5 + 0.5) * 255);
      pixels[px + 3] = 255;
    }
  }
  return energy;
}

type TileMesh = {
  count: number;
  draw(): void;
  dispose(): void;
};

/**
 * A per-tile quad buffer — `cols` × `rows` tiles, 4 vertices and 6 indices
 * each, built fresh (never shared with `createGridMesh`'s continuous grid,
 * since a tile effect needs a gap between quads, not one seamless surface).
 * `a_position` is each corner inset by half of `gapPx` on every side — a
 * fraction of the host's CSS box read once at build time, so it drifts a
 * little on a later resize rather than tracked live. `a_uv` is the same
 * corner's uv without that inset, so the mapped texture is cut at the tile
 * boundary rather than shrunk to fit the smaller quad. `a_center` is the
 * tile's own centre, unshifted, for the vertex shader's per-tile rotation
 * and field lookup.
 */
function createTileMesh(
  gl: GLContext,
  program: Program,
  cols: number,
  rows: number,
  gapPx: number,
  containerWidth: number,
  containerHeight: number,
): TileMesh {
  const vao = mustCreate(gl.createVertexArray(), "tile mesh VAO");
  const positionBuffer = mustCreate(
    gl.createBuffer(),
    "tile mesh position buffer",
  );
  const uvBuffer = mustCreate(gl.createBuffer(), "tile mesh uv buffer");
  const centerBuffer = mustCreate(gl.createBuffer(), "tile mesh center buffer");
  const indexBuffer = mustCreate(gl.createBuffer(), "tile mesh index buffer");

  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const insetUvX =
    containerWidth > 0 ? clamp(gapPx / 2 / containerWidth, 0, 0.49 / c) : 0;
  const insetUvY =
    containerHeight > 0 ? clamp(gapPx / 2 / containerHeight, 0, 0.49 / r) : 0;

  const vertexCount = c * r * 4;
  const positions = new Float32Array(vertexCount * 2);
  const uvs = new Float32Array(vertexCount * 2);
  const centers = new Float32Array(vertexCount * 2);
  const indexCount = c * r * 6;
  const useShort = vertexCount <= 65535;
  const indices = useShort
    ? new Uint16Array(indexCount)
    : new Uint32Array(indexCount);

  let v = 0;
  let ii = 0;
  for (let row = 0; row < r; row += 1) {
    const v0 = row / r;
    const v1 = (row + 1) / r;
    for (let col = 0; col < c; col += 1) {
      const u0 = col / c;
      const u1 = (col + 1) / c;
      const base = v;
      // Corner order: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
      const cornerU = [u0, u1, u0, u1];
      const cornerV = [v0, v0, v1, v1];
      const insetCornerU = [
        u0 + insetUvX,
        u1 - insetUvX,
        u0 + insetUvX,
        u1 - insetUvX,
      ];
      const insetCornerV = [
        v0 + insetUvY,
        v0 + insetUvY,
        v1 - insetUvY,
        v1 - insetUvY,
      ];
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      for (let k = 0; k < 4; k += 1) {
        positions[v * 2] = insetCornerU[k] ?? 0;
        positions[v * 2 + 1] = insetCornerV[k] ?? 0;
        uvs[v * 2] = cornerU[k] ?? 0;
        uvs[v * 2 + 1] = cornerV[k] ?? 0;
        centers[v * 2] = cu;
        centers[v * 2 + 1] = cv;
        v += 1;
      }
      const a = base;
      const b = base + 1;
      const bl = base + 2;
      const br = base + 3;
      indices[ii] = a;
      indices[ii + 1] = bl;
      indices[ii + 2] = b;
      indices[ii + 3] = b;
      indices[ii + 4] = bl;
      indices[ii + 5] = br;
      ii += 6;
    }
  }

  gl.bindVertexArray(vao);
  const bindAttribute = (
    buffer: WebGLBuffer,
    name: string,
    data: Float32Array,
  ) => {
    const location = program.attributes[name];
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    if (location === undefined) return;
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  };
  bindAttribute(positionBuffer, "a_position", positions);
  bindAttribute(uvBuffer, "a_uv", uvs);
  bindAttribute(centerBuffer, "a_center", centers);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const indexType = useShort ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT;
  let disposed = false;
  return {
    count: indexCount,
    draw: () => {
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, indexCount, indexType, 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteVertexArray(vao);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(uvBuffer);
      gl.deleteBuffer(centerBuffer);
      gl.deleteBuffer(indexBuffer);
    },
  };
}

/** Walks up from the host to the first opaque background colour — the same fallback crystal-lens and warp-grid use so a fully transparent painted texture composites onto the page rather than onto black. */
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

type TileLayerProps = Required<
  Pick<
    TileWaveProps,
    | "cols"
    | "rows"
    | "gap"
    | "tilt"
    | "lift"
    | "radius"
    | "stiffness"
    | "damping"
    | "ring"
  >
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the tile mesh, the two
 * textures (the painted DOM and the small field), the CPU field simulation,
 * and the frame loop; reads everything else from the surface.
 */
function TileLayer({
  cols,
  rows,
  gap,
  tilt,
  lift,
  radius,
  stiffness,
  damping,
  ring,
  background,
}: TileLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const meshRef = React.useRef<TileMesh | null>(null);
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
  const ringsRef = React.useRef<Ring[]>([]);
  const pointerRef = React.useRef<{ x: number; y: number } | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef<SimParams>({
    tilt,
    lift,
    radius,
    stiffness,
    damping,
    ring,
  });
  React.useEffect(() => {
    paramsRef.current = { tilt, lift, radius, stiffness, damping, ring };
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
    const bg = bgRef.current;
    // Gaps show the ground, so the clear colour — not a transparent clear —
    // is the effect's background, unlike the overlay-mode effects nearby.
    gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_field", fieldTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_grid: [field.cols, field.rows],
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
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: false });
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
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
      program.dispose();
      glRef.current = null;
      programRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The field and the tile mesh are both sized from cols×rows (and the mesh
  // additionally from gap), so they're set up — and torn down — independently
  // of the base GL setup above; changing cols/rows/gap must not recompile
  // the program, only reallocate the field and rebuild the geometry.
  React.useEffect(() => {
    if (!surface.active) return;
    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    if (!gl || !program || !canvas || failedRef.current) return;
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
    const rect = canvas.getBoundingClientRect();
    const mesh = createTileMesh(
      gl,
      program,
      cols,
      rows,
      gap,
      rect.width,
      rect.height,
    );

    fieldRef.current = field;
    fieldTextureRef.current = texture;
    fieldVersionRef.current = 1;
    uploadedFieldVersionRef.current = 0;
    meshRef.current = mesh;
    ringsRef.current = [];
    requestFrame();

    return () => {
      gl.deleteTexture(texture);
      fieldTextureRef.current = null;
      fieldRef.current = null;
      mesh.dispose();
      meshRef.current = null;
    };
  }, [surface.active, cols, rows, gap, requestFrame]);

  // Every completed paint asks for a frame, even while the tiles are at rest.
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

  // Pointer and click on the host: a move updates the hover target every
  // tile springs toward; a click drops a ring. The loop steps the field,
  // asks for a redraw, and reschedules itself only while there's still
  // energy left to settle or a ring still in flight.
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
      const p = paramsRef.current;
      const energy = stepField(
        field,
        ringsRef.current,
        pointerRef.current,
        p,
        cellW,
        cellH,
      );
      ringsRef.current = ringsRef.current.filter(
        (r) => r.radius <= r.maxRadius,
      );
      fieldVersionRef.current += 1;
      requestFrame();
      if (energy > ENERGY_STOP || ringsRef.current.length > 0) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };

    const ensureLoop = () => {
      if (simFrameRef.current === null) {
        simFrameRef.current = requestAnimationFrame(stepSimulation);
      }
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      ensureLoop();
    };
    const reset = () => {
      // The target drops to zero on leave — even a field that had already
      // settled into a steady hover needs the loop restarted to spring back.
      pointerRef.current = null;
      ensureLoop();
    };
    const click = (event: MouseEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const maxRadius = Math.max(
        Math.hypot(x, y),
        Math.hypot(rect.width - x, y),
        Math.hypot(x, rect.height - y),
        Math.hypot(rect.width - x, rect.height - y),
      );
      ringsRef.current = [...ringsRef.current, { x, y, radius: 0, maxRadius }];
      ensureLoop();
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", reset);
    host.addEventListener("pointercancel", reset);
    host.addEventListener("click", click);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", reset);
      host.removeEventListener("pointercancel", reset);
      host.removeEventListener("click", click);
      if (simFrameRef.current !== null)
        cancelAnimationFrame(simFrameRef.current);
      simFrameRef.current = null;
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="tile-wave"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface cut into a grid of tiles that tilt and lift as the cursor
 * passes, a wave rolling out from the pointer and settling on springs; a
 * click sends a ring through the whole grid, kicking every tile its
 * wavefront crosses. Each tile's tiltX, tiltY, and lift are simulated per
 * tile on the CPU — springing toward a pointer-derived target, with click
 * rings layering in one-off velocity kicks — and read by the vertex shader
 * from a small `cols` × `rows` texture, one texel per tile, so the
 * simulation cost stays independent of how much DOM the surface paints.
 * Every tile is its own quad on a custom grid mesh, inset by `gap` so the
 * ground shows between them, rotated about its own centre in the vertex
 * shader and lit by a fixed key light.
 * Reduced motion: `SurfacePaint` renders in replace mode, so the layer
 * returns null and the real, undistorted DOM shows in its place.
 */
export function TileWave({
  cols = 16,
  rows = 10,
  gap = 2,
  tilt = 22,
  lift = 14,
  radius = 180,
  stiffness = 0.14,
  damping = 0.82,
  ring = 1,
  background,
  paint,
  className,
  children,
}: TileWaveProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <TileLayer
          cols={cols}
          rows={rows}
          gap={gap}
          tilt={tilt}
          lift={lift}
          radius={radius}
          stiffness={stiffness}
          damping={damping}
          ring={ring}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
