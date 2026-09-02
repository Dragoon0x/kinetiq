"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type MapFoldMode = "scroll" | "manual";

export type MapFoldProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "manual" takes `progress` directly. @default "scroll" */
  mode?: MapFoldMode;
  /** The fold position for `mode="manual"`: 0 and 1 are folded shut, 0.5 is flat and fully open. Ignored otherwise. */
  progress?: number;
  /** Panel columns the sheet folds into. @default 3 */
  cols?: number;
  /** Panel rows the sheet folds into. @default 4 */
  rows?: number;
  /** Maximum hinge rotation in degrees. @default 60 */
  angle?: number;
  /** Strength of the darkening applied to a panel as it turns away from flat. @default 0.5 */
  shading?: number;
  /** Fill colour behind transparent texels; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Vertex shader: displaces a (cols*8) x (rows*8) grid into a `cols` x `rows`
// panel fold. Row hinges are walked first (each panel's own alternating-sign
// rotation composed onto the vertex's position and depth), then column
// hinges walk the same way in x, carrying the row fold's depth forward as a
// base — the strip the rows made gets folded again, the way a road map
// really goes together.
const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform float u_rows;
uniform float u_cols;
uniform float u_angle;
uniform float u_f;
uniform float u_halfWidthPx;
uniform float u_halfHeightPx;
uniform float u_rowExtentPx;
uniform float u_colExtentPx;
out vec2 v_uv;
out float v_shade;
out float v_crease;

const int MAX_PANELS = 32;

void main() {
  float rows = max(u_rows, 1.0);
  float cols = max(u_cols, 1.0);
  float rowPanelPx = (u_halfHeightPx * 2.0) / rows;
  float colPanelPx = (u_halfWidthPx * 2.0) / cols;
  float baseTheta = radians(u_angle) * u_f;

  // ROW hinges first.
  float rowIndexF = min(floor(a_uv.y * rows), rows - 1.0);
  float rowLocal = clamp(a_uv.y * rows - rowIndexF, 0.0, 1.0);
  float rowOffsetPx = 0.0;
  float zPx = 0.0;
  float rowTheta = 0.0;
  for (int k = 0; k < MAX_PANELS; k += 1) {
    if (float(k) >= rows) break;
    float sgn = mod(float(k), 2.0) < 0.5 ? 1.0 : -1.0;
    float theta = baseTheta * sgn;
    float frac = float(k) < rowIndexF ? 1.0 : rowLocal;
    rowOffsetPx += rowPanelPx * cos(theta) * frac;
    zPx += rowPanelPx * sin(theta) * frac;
    if (float(k) >= rowIndexF) {
      rowTheta = theta;
      break;
    }
  }

  // COLUMN hinges the same way in x, starting z from what the row hinges
  // already folded in.
  float colIndexF = min(floor(a_uv.x * cols), cols - 1.0);
  float colLocal = clamp(a_uv.x * cols - colIndexF, 0.0, 1.0);
  float colOffsetPx = 0.0;
  float colTheta = 0.0;
  for (int k = 0; k < MAX_PANELS; k += 1) {
    if (float(k) >= cols) break;
    float sgn = mod(float(k), 2.0) < 0.5 ? 1.0 : -1.0;
    float theta = baseTheta * sgn;
    float frac = float(k) < colIndexF ? 1.0 : colLocal;
    colOffsetPx += colPanelPx * cos(theta) * frac;
    zPx += colPanelPx * sin(theta) * frac;
    if (float(k) >= colIndexF) {
      colTheta = theta;
      break;
    }
  }

  // Re-centre both axes around the mesh middle, then let w carry the
  // perspective foreshortening — x and y stay the plain clip-space values,
  // never pre-multiplied by w.
  float yPx = u_rowExtentPx * 0.5 - rowOffsetPx;
  float xPx = colOffsetPx - u_colExtentPx * 0.5;
  float w = 1.0 + zPx / 900.0;

  v_uv = a_uv;
  v_shade = 0.6 + 0.4 * cos(rowTheta + colTheta);
  v_crease = min(min(rowLocal, 1.0 - rowLocal), min(colLocal, 1.0 - colLocal));

  gl_Position = vec4(xPx / u_halfWidthPx, yPx / u_halfHeightPx, 0.0, w);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec4 u_bg;
uniform float u_shading;
in vec2 v_uv;
in float v_shade;
in float v_crease;
out vec4 o_color;

void main() {
  vec4 tex = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  vec3 shaded = tex.rgb * mix(1.0, v_shade, u_shading);
  vec3 color = mix(u_bg.rgb, shaded, tex.a);
  float creaseLine = 1.0 - smoothstep(0.0, 0.035, v_crease);
  color *= mix(1.0, 0.6, creaseLine);
  o_color = vec4(color, 1.0);
}
`;

type MapFoldLayerProps = Required<
  Pick<MapFoldProps, "mode" | "cols" | "rows" | "angle" | "shading">
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Walks up from the host to the first opaque background colour, so folded
 * texels composite onto the page rather than onto black — the same probe
 * cube-fold and crystal-lens use for their own backdrop. */
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
  );
}

/**
 * The GL layer. Owns the context, the program, the mesh, the texture, the
 * progress motion value and the frame loop; reads everything else from the
 * surface.
 */
function MapFoldLayer({
  mode,
  progress: progressProp,
  cols,
  rows,
  angle,
  shading,
  background,
}: MapFoldLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const progress = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const meshRef = React.useRef<Mesh | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ cols, rows, angle, shading });

  // One frame: upload the texture if a new paint landed, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const mesh = meshRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !mesh || !canvas || !live.canvas) return;
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
    const halfWidthPx = size.width / size.dpr / 2;
    const halfHeightPx = size.height / size.dpr / 2;
    const params = paramsRef.current;
    const rowCount = Math.max(1, Math.round(params.rows));
    const colCount = Math.max(1, Math.round(params.cols));

    // The road-map contract: closed at both ends of the scroll, flat and
    // open at its midpoint.
    const p = progress.get();
    const openness = Math.sin(p * Math.PI);
    const f = 1 - openness;
    const angleRad = (params.angle * Math.PI) / 180;
    const rowPanelPx = (halfHeightPx * 2) / rowCount;
    const colPanelPx = (halfWidthPx * 2) / colCount;
    // cos is even, so the alternating hinge sign washes out of this total —
    // every panel compresses by the same magnitude regardless of direction.
    const rowExtentPx = rowCount * rowPanelPx * Math.cos(angleRad * f);
    const colExtentPx = colCount * colPanelPx * Math.cos(angleRad * f);

    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_rows: rowCount,
      u_cols: colCount,
      u_angle: params.angle,
      u_f: f,
      u_halfWidthPx: halfWidthPx,
      u_halfHeightPx: halfHeightPx,
      u_rowExtentPx: rowExtentPx,
      u_colExtentPx: colExtentPx,
      u_shading: params.shading,
      u_bg: bg,
    });
    mesh.draw();
  }, [progress]);

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
    const p = paramsRef.current;
    const rowCount = Math.max(1, Math.round(p.rows));
    const colCount = Math.max(1, Math.round(p.cols));
    const mesh = createGridMesh(gl, program, colCount * 8, rowCount * 8);
    glRef.current = gl;
    programRef.current = program;
    meshRef.current = mesh;
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
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // scroll or progress change.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      mesh.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      meshRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every progress change and every completed paint asks for a frame — no
  // continuous loop, this effect only reacts to the two things that can
  // change what the mesh should look like.
  React.useEffect(() => {
    const unsub = progress.on("change", requestFrame);
    return unsub;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // A shape prop changed with progress otherwise static: still worth one
  // fresh frame, just not a loop. (cols/rows only reshape the mesh at GL
  // setup time, the way cloth-drape's own cols/rows do.)
  React.useEffect(() => {
    paramsRef.current = { cols, rows, angle, shading };
    requestFrame();
  }, [cols, rows, angle, shading, requestFrame]);

  // Resolve the fill colour against the host, so `var(--token)` reads the
  // theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // mode="manual": the prop drives the motion value directly, no spring.
  React.useEffect(() => {
    if (mode !== "manual") return;
    progress.jump(clamp01(progressProp ?? 0));
  }, [mode, progressProp, progress]);

  // mode="scroll": the motion value is springed toward the host's place in
  // the viewport on every scroll and resize.
  React.useEffect(() => {
    if (mode === "manual") return;
    const host = surface.host;
    if (!host) return;

    const computeProgress = (): number => {
      const rect = host.getBoundingClientRect();
      const vh = window.innerHeight;
      const denom = vh + rect.height;
      const raw = denom > 0 ? (vh - rect.top) / denom : 0;
      return clamp01(raw);
    };
    // Compute immediately so a host already in view folds correctly before
    // the first scroll event ever fires.
    progress.jump(computeProgress());
    const onScroll = () => {
      animate(progress, computeProgress(), springs.glide);
    };
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [mode, surface.host, progress]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="map-fold"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a paper map, hinged row by row and then column by
 * column: a `cols`×8 by `rows`×8 grid mesh walks every vertex through its
 * own stack of panel rotations, each hinge's sign alternating from the one
 * before it, composing both the in-plane position and the depth the way a
 * real fold stacks them. Row hinges settle first; column hinges then fold
 * the already-hinged strip, carrying its depth forward as their own base.
 * `progress` runs folded (0) through flat and fully open at the midpoint to
 * folded again (1) — `mode="scroll"` springs that number from the host's
 * place in the viewport with `springs.glide`, `mode="manual"` takes it from
 * you. A frame is requested only when progress actually changes or a new
 * paint lands — there is no continuous loop.
 * Reduced motion: SurfacePaint shows the real DOM flat and this layer renders nothing.
 */
export function MapFold({
  mode = "scroll",
  progress,
  cols = 3,
  rows = 4,
  angle = 60,
  shading = 0.5,
  background,
  paint,
  className,
  children,
}: MapFoldProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <MapFoldLayer
          mode={mode}
          progress={progress}
          cols={cols}
          rows={rows}
          angle={angle}
          shading={shading}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
