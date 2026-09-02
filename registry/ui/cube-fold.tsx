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

export type CubeFoldMode = "scroll" | "manual";

export type CubeFoldProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "manual" takes `progress` directly. @default "scroll" */
  mode?: CubeFoldMode;
  /** The fold position for `mode="manual"`, 0 (entering, folded low) to 1 (leaving, folded high). Ignored otherwise. */
  progress?: number;
  /** Hinge band depth, as a fraction of the surface's half-height (0..0.5). @default 0.28 */
  band?: number;
  /** Maximum hinge rotation in degrees. @default 75 */
  angle?: number;
  /** Perspective distance in CSS pixels, the way a CSS perspective value reads — smaller exaggerates the fold. @default 900 */
  perspective?: number;
  /** Strength of the darkening applied to a band as it turns away from flat. @default 0.5 */
  shading?: number;
  /** Fill colour behind transparent texels; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Vertex shader: displaces the grid mesh (1 col x 48 rows, from
// createGridMesh) into two hinged bands and a flat middle, then hands the
// GPU a per-vertex w so the fixed-function perspective divide does the
// foreshortening — no manual divide of x/y here.
const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform float u_band;
uniform float u_angle;
uniform float u_topFold;
uniform float u_bottomFold;
uniform float u_perspective;
uniform float u_halfHeightPx;
out vec2 v_uv;
out float v_shade;

void main() {
  vec2 pos = a_position;
  float t = a_uv.y;
  float z = 0.0;
  float shade = 1.0;

  if (t < u_band) {
    // Top band: hinge sits at the band boundary, the flap swings up and
    // toward the viewer as topFold rises from 0 to 1.
    float hingeY = 1.0 - 2.0 * u_band;
    float localY = pos.y - hingeY;
    float theta = radians(u_angle) * u_topFold;
    float c = cos(theta);
    float s = sin(theta);
    pos.y = hingeY + localY * c;
    z = localY * s;
    shade = c;
  } else if (t > 1.0 - u_band) {
    // Bottom band: same construction, mirrored about its own hinge.
    float hingeY = -1.0 + 2.0 * u_band;
    float localY = hingeY - pos.y;
    float theta = radians(u_angle) * u_bottomFold;
    float c = cos(theta);
    float s = sin(theta);
    pos.y = hingeY - localY * c;
    z = localY * s;
    shade = c;
  }

  v_uv = a_uv;
  v_shade = shade;
  // z is clip-space small (safely inside [-w, w], so nothing gets clipped)
  // but the perspective divide needs a depth that means something next to
  // u_perspective, so it is rescaled into CSS pixels via u_halfHeightPx
  // first — a face that turns toward the viewer divides by a smaller w
  // and grows, one that turns away divides by a larger w and shrinks.
  float w = 1.0 - (z * u_halfHeightPx) / u_perspective;
  gl_Position = vec4(pos.x, pos.y, z, w);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec4 u_bg;
uniform float u_shading;
in vec2 v_uv;
in float v_shade;
out vec4 o_color;

void main() {
  vec4 tex = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  vec3 shaded = mix(tex.rgb, tex.rgb * 0.55, (1.0 - v_shade) * u_shading);
  vec3 color = mix(u_bg.rgb, shaded, tex.a);
  o_color = vec4(color, 1.0);
}
`;

type FoldLayerProps = Required<
  Pick<CubeFoldProps, "mode" | "band" | "angle" | "perspective" | "shading">
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Hermite smoothstep with the edges taken in either order — unlike GLSL's
 * built-in, `edge0 > edge1` is well defined here (the ramp simply runs the
 * other way), which is what topFold's (0.5, 0.0) pair needs. */
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Walks up from the host to the first opaque background colour, so folded
 * texels composite onto the page rather than onto black — the same probe
 * laser-print uses for its own backdrop. */
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
function FoldLayer({
  mode,
  progress: progressProp,
  band,
  angle,
  perspective,
  shading,
  background,
}: FoldLayerProps) {
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
  const paramsRef = React.useRef({ band, angle, perspective, shading });

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
    const p = progress.get();
    const topFold = smoothstep(0.5, 0.0, p);
    const bottomFold = smoothstep(0.5, 1.0, p);
    const params = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_band: params.band,
      u_angle: params.angle,
      u_perspective: params.perspective,
      u_shading: params.shading,
      u_topFold: topFold,
      u_bottomFold: bottomFold,
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
    const mesh = createGridMesh(gl, program, 1, 48);
    glRef.current = gl;
    programRef.current = program;
    meshRef.current = mesh;
    uploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
    paramsRef.current = { band, angle, perspective, shading };
    requestFrame();
  }, [band, angle, perspective, shading, requestFrame]);

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
      data-effect-canvas="cube-fold"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as one mesh, hinged twice. A thin band top and bottom folds
 * away over its own hinge as the surface crosses the mid-point of its
 * scroll — real perspective, not a 2D skew, so the turning face genuinely
 * foreshortens and darkens as it leaves flat, meeting the untouched middle
 * band edge to edge. `mode="scroll"` reads the host's place in the
 * viewport on every scroll and resize, sprung with `springs.glide`;
 * `mode="manual"` takes the number from you. A frame is requested only
 * when progress actually changes or a new paint lands — there is no
 * continuous loop.
 * Reduced motion: SurfacePaint shows the real DOM flat and this layer renders nothing.
 */
export function CubeFold({
  mode = "scroll",
  progress,
  band = 0.28,
  angle = 75,
  perspective = 900,
  shading = 0.5,
  background,
  paint,
  className,
  children,
}: CubeFoldProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FoldLayer
          mode={mode}
          progress={progress}
          band={band}
          angle={angle}
          perspective={perspective}
          shading={shading}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
