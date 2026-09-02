"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
  GLSL_NOISE,
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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type MarbleVeinProps = {
  /** Strength of the carved vein field mixed into the base stone (0..1). @default 0.5 */
  vein?: number;
  /** Spatial frequency of the fbm field that warps the veins. @default 0.006 */
  scale?: number;
  /** Strength of the fbm mottle folded into the stone colour. @default 0.2 */
  contrast?: number;
  /** Strength of the specular lobe under the pointer. @default 0.5 */
  sheen?: number;
  /** Sheen radius in CSS pixels. @default 260 */
  radius?: number;
  /** Base stone colour. CSS, tokens included; resolved against the host. @default "#e8e4dc" */
  stone?: string;
  /** Fill colour behind transparent texture regions; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_stone;
uniform float u_vein;
uniform float u_scale;
uniform float u_contrast;
uniform float u_sheen;
uniform float u_radius;
uniform vec2 u_pointer;
uniform float u_pointerAmt;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec2 kx_rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Composites a texture sample over the host's own background wherever the
// painted DOM left that pixel transparent, so a reflection sample never
// reads as black.
vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;

  // Two vein sets: the primary runs along x, folded by an fbm field so it
  // wanders like a real seam instead of a straight stripe. The second set is
  // fainter and turned to another angle, so together they read as one
  // quarried slab rather than a repeating pattern.
  float v1 = pow(abs(sin(px.x * 0.01 + kx_fbm(px * u_scale) * 6.0)), 8.0);
  vec2 pxB = kx_rotate(px, 0.9);
  float v2 = pow(abs(sin(pxB.x * 0.011 + kx_fbm(pxB * u_scale * 1.3 + 19.0) * 6.0)), 8.0);
  float veins = clamp(v1 + v2 * 0.55, 0.0, 1.0);

  vec3 veinTone = u_stone * 0.3;
  vec3 stoneColor = mix(u_stone, veinTone, veins * u_vein);

  // A slow fbm mottle keeps the field between veins from reading flat.
  float mottle = kx_fbm(px * u_scale * 3.1 + 4.0) - 0.5;
  stoneColor *= 1.0 + mottle * u_contrast * 0.6;
  stoneColor = clamp(stoneColor, 0.0, 1.0);

  // The page inlays into the stone like carved lettering filled with ink:
  // dark, opaque page pixels multiply their own colour into the marble;
  // transparent regions contribute nothing, leaving plain stone.
  vec4 page = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  float ink = clamp(1.0 - kx_luma(page.rgb), 0.0, 1.0) * page.a;
  vec3 inlaid = mix(stoneColor, stoneColor * page.rgb, ink);

  // A faint, offset ghost of the page stands in for light skating across
  // the polish.
  vec3 reflection = sampleOver(v_uv + vec2(6.0, 6.0) / u_res);
  vec3 c = mix(inlaid, reflection, 0.08);

  // A broad specular lobe centred on the sprung pointer, held to its radius.
  float dist = length(px - u_pointer);
  float lobe = pow(clamp(1.0 - dist / max(u_radius, 1.0), 0.0, 1.0), 2.5);
  c += vec3(1.0, 0.98, 0.93) * lobe * u_sheen * u_pointerAmt;

  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

type MarbleVeinLayerProps = Required<
  Pick<
    MarbleVeinProps,
    "vein" | "scale" | "contrast" | "sheen" | "radius" | "stone"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function MarbleVeinLayer({
  vein,
  scale,
  contrast,
  sheen,
  radius,
  stone,
  background,
}: MarbleVeinLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const stoneRef = React.useRef<[number, number, number, number]>([
    0.91, 0.89, 0.86, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ vein, scale, contrast, sheen, radius });
  React.useEffect(() => {
    paramsRef.current = { vein, scale, contrast, sheen, radius };
  });

  // One frame: upload the texture if a new paint landed, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
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
    const bg = bgRef.current;
    const stoneColor = stoneRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_stone: [stoneColor[0], stoneColor[1], stoneColor[2]],
      u_vein: p.vein,
      u_scale: p.scale,
      u_contrast: p.contrast,
      u_sheen: p.sheen,
      u_radius: p.radius,
      u_pointer: [x.get(), y.get()],
      u_pointerAmt: opacity.get(),
      u_bg: bg,
    });
    tri.draw();
  }, [x, y, opacity]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // replace mode), so this is keyed on `surface.active`, not on mount — a
  // mount-only effect would run against no canvas at all.
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

  // Every spring tick and every completed paint asks for a frame. Motion
  // values only fire "change" while animating, so once the pointer's spring
  // settles this stops on its own.
  React.useEffect(() => {
    const unsubs = [x, y, opacity].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: spring the sheen toward the cursor and fade its
  // strength in and out. Gated on `surface.active` — under reduced motion
  // this layer never mounts, so there is nothing to listen for.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    stoneRef.current = resolveColor(stone, host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.snap);
      animate(y, event.clientY - rect.top, springs.snap);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      animate(opacity, 0, { duration: 0.22 });
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.active, surface.host, background, stone, x, y, opacity]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="marble-vein"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface set into a slab of polished marble. Two fbm-warped sine
 * fields, turned to different angles, carve thin bright and dark veins
 * through a base stone colour, and a slow fbm mottle keeps the field from
 * repeating — nothing here is random per frame, the grain is a fixed
 * function of position, the same slab every time. The page's own dark
 * pixels multiply into the stone as inlay, tinted by whatever colour they
 * actually are, so text and controls read as ink let into rock rather than
 * a flat stencil. A broad specular lobe follows the sprung pointer within a
 * fixed radius, joined by a faint 6px-offset ghost of the page standing in
 * for a reflection off the polish; the loop that drives the lobe only runs
 * while that spring is moving and stops once it settles.
 * Reduced motion: SurfacePaint's replace-mode contract handles it — the
 * real DOM shows and this layer renders nothing.
 */
export function MarbleVein({
  vein = 0.5,
  scale = 0.006,
  contrast = 0.2,
  sheen = 0.5,
  radius = 260,
  stone = "#e8e4dc",
  background,
  paint,
  className,
  children,
}: MarbleVeinProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <MarbleVeinLayer
          vein={vein}
          scale={scale}
          contrast={contrast}
          sheen={sheen}
          radius={radius}
          stone={stone}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
