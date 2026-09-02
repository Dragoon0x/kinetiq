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

export type RibbonTwistMode = "scroll" | "manual";

export type RibbonTwistProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "manual" takes `progress` directly. @default "scroll" */
  mode?: RibbonTwistMode;
  /** The twist position for `mode="manual"`, 0 (entering) to 1 (leaving), flat at 0.5. Ignored otherwise. */
  progress?: number;
  /** How many quarter-turns the ribbon makes end to end at full twist. @default 1 */
  turns?: number;
  /** Strength of the darkening applied as a row turns edge-on. @default 0.5 */
  shading?: number;
  /** Fill colour for the reverse of the ribbon, tinted by a mirrored sample of the texture. @default "#e7e5df" */
  back?: string;
  /** Fill colour behind transparent texels; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Vertex shader: rotates the grid mesh (1 col x 64 rows, from
// createGridMesh) about the ribbon's own vertical spine. Every row carries
// its own angle from a_uv.y, so the twist runs continuously along the
// length rather than hinging at one seam. x' stays a plain clip-space
// rotation of a_position.x — no pixel detour, no division, nothing to blow
// up when the canvas is briefly zero-width; only z takes a trip through
// real CSS pixels, because that is the unit the perspective throw (900px)
// is written in.
const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform float u_turns;
uniform float u_twist;
uniform float u_halfWidthPx;
out vec2 v_uv;
out float v_facing;
out float v_shade;

void main() {
  float angle = (a_uv.y - 0.5) * u_turns * radians(90.0) * u_twist;
  float c = cos(angle);
  float s = sin(angle);

  // x_centered in pixels, used only to give z a real-world scale next to
  // the 900px perspective throw below.
  float xCenteredPx = a_position.x * u_halfWidthPx;
  float zPx = xCenteredPx * s;

  v_uv = a_uv;
  v_facing = sign(c);
  v_shade = 0.6 + 0.4 * abs(c);

  // Hardware perspective divide, the same trick cube-fold uses: hand the
  // GPU a per-vertex w rather than dividing x by hand. zPx normalises
  // itself away here, so nothing downstream ever reads a raw pixel value.
  float w = 1.0 + zPx / 900.0;
  gl_Position = vec4(a_position.x * c, a_position.y, 0.0, w);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec4 u_bg;
uniform vec4 u_back;
uniform float u_shading;
in vec2 v_uv;
in float v_facing;
in float v_shade;
out vec4 o_color;

void main() {
  vec2 uv = clamp(v_uv, 0.0, 1.0);

  if (v_facing >= 0.0) {
    vec4 tex = texture(u_tex, uv);
    vec3 base = mix(u_bg.rgb, tex.rgb, tex.a);
    o_color = vec4(base * mix(1.0, v_shade, u_shading), 1.0);
    return;
  }

  // The reverse of the ribbon: the back colour, lightly informed by a
  // horizontally mirrored sample of the same texture, darkened toward
  // edge-on the way the front is.
  vec2 mirroredUv = clamp(vec2(1.0 - v_uv.x, v_uv.y), 0.0, 1.0);
  vec4 mirrored = texture(u_tex, mirroredUv);
  vec3 mirroredBase = mix(u_bg.rgb, mirrored.rgb, mirrored.a);
  vec3 back = mix(u_back.rgb, mirroredBase, 0.3) * v_shade;
  o_color = vec4(back, 1.0);
}
`;

type TwistLayerProps = Required<
  Pick<RibbonTwistProps, "mode" | "turns" | "shading" | "back">
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Walks up from the host to the first opaque background colour, so ribbon
 * texels composite onto the page rather than onto black — the same probe
 * cube-fold and laser-print use for their own backdrop. */
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
 * progress motion value, the resolved fill/back colours, and the frame
 * request; reads everything else from the surface.
 */
function TwistLayer({
  mode,
  progress: progressProp,
  turns,
  shading,
  back,
  background,
}: TwistLayerProps) {
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
  const backRef = React.useRef<[number, number, number, number]>([
    0.906, 0.898, 0.875, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ turns, shading });

  // One frame: upload the texture if a new paint landed, then draw the
  // mesh twice — back-facing triangles first, front-facing on top — so the
  // nearer face always wins without needing a depth buffer (createGL's
  // GLOptions has no `depth` flag to ask for one).
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
    const p = progress.get();
    const twist = (p - 0.5) * 2;
    const params = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_turns: params.turns,
      u_twist: twist,
      u_halfWidthPx: halfWidthPx,
      u_shading: params.shading,
      u_bg: bg,
      u_back: backRef.current,
    });
    gl.cullFace(gl.FRONT);
    mesh.draw();
    gl.cullFace(gl.BACK);
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
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);

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
    paramsRef.current = { turns, shading };
    requestFrame();
  }, [turns, shading, requestFrame]);

  // Resolve the fill and back colours against the host, so `var(--token)`
  // reads the theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    backRef.current = resolveColor(back, host);
    requestFrame();
  }, [surface.host, background, back, requestFrame]);

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
    // Compute immediately so a host already in view twists correctly
    // before the first scroll event ever fires.
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
      data-effect-canvas="ribbon-twist"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a single ribbon, twisting about its own vertical spine
 * as the surface crosses the midpoint of its scroll. A slim mesh
 * (createGridMesh, 1 x 64 rows) carries a per-row rotation angle that
 * grows toward the top and bottom edges and vanishes at mid-scroll, where
 * the page reads flat and undistorted. Past a quarter turn a row shows its
 * reverse — the `back` colour lightly tinted by a horizontally mirrored
 * sample of the same texture — shaded darker the further it turns edge-on;
 * front and back are drawn in two passes, culled by winding, so the nearer
 * face always wins without a depth buffer. `mode="scroll"` reads the
 * host's place in the viewport on every scroll and resize, sprung with
 * `springs.glide`; `mode="manual"` takes the number from you. A frame is
 * requested only when progress actually changes or a new paint lands —
 * there is no continuous loop.
 * Reduced motion: SurfacePaint shows the real DOM flat and this layer renders nothing.
 */
export function RibbonTwist({
  mode = "scroll",
  progress,
  turns = 1,
  shading = 0.5,
  back = "#e7e5df",
  background,
  paint,
  className,
  children,
}: RibbonTwistProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <TwistLayer
          mode={mode}
          progress={progress}
          turns={turns}
          shading={shading}
          back={back}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
