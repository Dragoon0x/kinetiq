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

export type AccordionPleatMode = "scroll" | "manual";

export type AccordionPleatProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "manual" takes `progress` directly. @default "scroll" */
  mode?: AccordionPleatMode;
  /** The pleat position for `mode="manual"`, 0 (folded shut, entering) to 1 (folded shut, leaving) — fully open at 0.5. Ignored otherwise. */
  progress?: number;
  /** Even hinge count along the sheet's height. @default 8 */
  pleats?: number;
  /** Maximum per-panel hinge rotation in degrees, reached when the sheet is fully closed. @default 70 */
  angle?: number;
  /** Strength of the darkening applied to a panel as it turns away from flat, and to the crease lines at each hinge. @default 0.5 */
  shading?: number;
  /** Fill colour behind transparent texels and the space a shortened sheet leaves open; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Vertex shader: displaces the grid mesh (1 col x 64 rows, from
// createGridMesh) by walking its `pleats` hinge segments from the top.
// Each segment is a rigid panel of unfolded height h/pleats, rotated by
// angle * (1 - openness) with alternating sign; its compressed projected
// height (h_seg * cos) shortens the sheet and its z displacement
// (h_seg * sin, sign alternating) zigzags it panel to panel, exactly the
// way a paper fan's hinges stay put while its panels swing. The running
// sums are accumulated per vertex, then the whole sheet is re-centred
// vertically so it opens and closes around its own middle rather than
// hanging from the top edge.
const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform highp int u_pleats;
uniform float u_angle;
uniform float u_openness;
uniform float u_halfHeightPx;
out vec2 v_uv;
out float v_shade;

void main() {
  float t = a_uv.y;
  float totalH = 2.0;
  float hSeg = totalH / float(u_pleats);
  float theta = radians(u_angle) * (1.0 - u_openness);
  float c = cos(theta);
  float s = sin(theta);
  float sDist = t * totalH;

  float yDrop = 0.0;
  float z = 0.0;
  for (int i = 0; i < u_pleats; i++) {
    float segStart = float(i) * hSeg;
    float localFrac = clamp((sDist - segStart) / hSeg, 0.0, 1.0);
    float segSign = (i % 2 == 0) ? 1.0 : -1.0;
    yDrop += localFrac * hSeg * c;
    z += segSign * localFrac * hSeg * s;
  }

  float totalCompressedH = totalH * c;
  float posY = totalCompressedH * 0.5 - yDrop;

  v_uv = a_uv;
  v_shade = 0.55 + 0.45 * c;

  // z is clip-space small (safely inside [-w, w]) but the perspective
  // divide needs a depth that means something next to the fixed 900px
  // distance, so it is rescaled into CSS pixels via u_halfHeightPx first —
  // a panel that tilts toward the viewer divides by a smaller w and
  // grows, one that tilts away divides by a larger w and shrinks.
  float w = 1.0 + (z * u_halfHeightPx) / 900.0;
  gl_Position = vec4(a_position.x, posY, z, w);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec4 u_bg;
uniform float u_shading;
uniform highp int u_pleats;
in vec2 v_uv;
in float v_shade;
out vec4 o_color;

void main() {
  vec4 tex = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  vec3 shaded = tex.rgb * mix(1.0, v_shade, u_shading);

  // A thin darker line at every hinge boundary: the fraction of a pleat
  // segment nearest 0 or 1 in uv space.
  float segT = fract(v_uv.y * float(u_pleats));
  float distToHinge = min(segT, 1.0 - segT);
  float crease = 1.0 - smoothstep(0.0, 0.05, distToHinge);
  shaded *= 1.0 - crease * u_shading * 0.5;

  vec3 color = mix(u_bg.rgb, shaded, tex.a);
  o_color = vec4(color, 1.0);
}
`;

type PleatLayerProps = Required<
  Pick<AccordionPleatProps, "mode" | "pleats" | "angle" | "shading">
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Walks up from the host to the first opaque background colour, so a
 * shortened sheet composites its open space onto the page rather than
 * onto black — the same probe cube-fold and laser-print use. */
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
function PleatLayer({
  mode,
  progress: progressProp,
  pleats,
  angle,
  shading,
  background,
}: PleatLayerProps) {
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
  const paramsRef = React.useRef({ pleats, angle, shading });

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
    const halfHeightPx = size.height / size.dpr / 2;
    const p = clamp01(progress.get());
    // Never fold flat: a folded sheet still shows a sliver of itself.
    const openness = 0.3 + 0.7 * Math.sin(p * Math.PI);
    const params = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_pleats: params.pleats,
      u_angle: params.angle,
      u_openness: openness,
      u_shading: params.shading,
      u_halfHeightPx: halfHeightPx,
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
    const mesh = createGridMesh(gl, program, 1, 64);
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
  // fresh frame, just not a loop.
  React.useEffect(() => {
    paramsRef.current = { pleats, angle, shading };
    requestFrame();
  }, [pleats, angle, shading, requestFrame]);

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
    // Compute immediately so a host already in view opens correctly before
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
      data-effect-canvas="accordion-pleat"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as one sheet, hinged into `pleats` even panels along its
 * height and rotated with a real per-vertex fold on the grid mesh — not a
 * flat shader illusion, the geometry itself moves. `openness` runs
 * sin(progress x pi), so the sheet is flat at the midpoint of its scroll
 * and pleated shut at both ends; each panel's compressed height (h/pleats
 * x cos of the hinge angle) shortens the sheet while its z displacement
 * (sign alternating panel to panel) zigzags it the way a paper fan folds.
 * `mode="scroll"` reads the host's place in the viewport on every scroll
 * and resize, sprung with `springs.glide`; `mode="manual"` takes the
 * number from you. A frame is requested only when progress actually
 * changes or a new paint lands — there is no continuous loop.
 * Reduced motion: SurfacePaint shows the real DOM and this layer renders nothing.
 */
export function AccordionPleat({
  mode = "scroll",
  progress,
  pleats = 8,
  angle = 70,
  shading = 0.5,
  background,
  paint,
  className,
  children,
}: AccordionPleatProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PleatLayer
          mode={mode}
          progress={progress}
          pleats={pleats}
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
