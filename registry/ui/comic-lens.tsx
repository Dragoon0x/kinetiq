"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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

export type ComicLensProps = {
  /** Lens radius in CSS pixels. @default 180 */
  radius?: number;
  /** Feather width at the rim, as a fraction of the radius (0..1). @default 0.5 */
  softness?: number;
  /** Posterisation steps per channel. @default 4 */
  levels?: number;
  /** Outline thickness in CSS pixels — the radius the edge mask is dilated over. @default 0.8 */
  outline?: number;
  /** Ben-Day dot size/density multiplier. @default 1 */
  dots?: number;
  /** Outline ink colour. CSS; resolved with resolveColor. @default "#111111" */
  ink?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_levels;
uniform float u_outline;
uniform float u_dots;
uniform vec3 u_ink;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const float EDGE_THRESHOLD = 0.35;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// 3x3 Sobel over luminance, one texel step in every direction.
float sobelEdge(vec2 uv, vec2 texel) {
  float tl = kx_luma(sampleOver(uv + vec2(-texel.x, -texel.y)));
  float tc = kx_luma(sampleOver(uv + vec2(0.0, -texel.y)));
  float tr = kx_luma(sampleOver(uv + vec2(texel.x, -texel.y)));
  float ml = kx_luma(sampleOver(uv + vec2(-texel.x, 0.0)));
  float mr = kx_luma(sampleOver(uv + vec2(texel.x, 0.0)));
  float bl = kx_luma(sampleOver(uv + vec2(-texel.x, texel.y)));
  float bc = kx_luma(sampleOver(uv + vec2(0.0, texel.y)));
  float br = kx_luma(sampleOver(uv + vec2(texel.x, texel.y)));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);

  if (u_still > 0.5) {
    // Reduced motion: only a still panel outline, nothing beneath it is
    // redrawn and the lens does not spring to the pointer.
    float t = clamp(r / R, 0.0, 1.0);
    float ring = smoothstep(0.82, 0.985, t) * (1.0 - smoothstep(0.985, 1.0, t));
    o_color = vec4(u_ink, ring * 0.55 * u_opacity);
    return;
  }

  // + 0.001 keeps the two smoothstep edges from ever landing equal, even
  // when softness is exactly 0.
  float feather = clamp(u_softness, 0.0, 1.0) * R + 0.001;
  float mask = 1.0 - smoothstep(max(R - feather, 0.0), R, r);
  if (mask <= 0.0) { o_color = vec4(0.0); return; }

  vec2 uv = px / u_res;
  vec2 texel = 1.0 / u_res;
  vec3 base = sampleOver(uv);
  float lumaC = kx_luma(base);

  // Posterise: each channel snaps to one of levels even steps.
  float levels = max(u_levels, 2.0);
  vec3 poster = clamp(floor(base * levels) / (levels - 1.0), 0.0, 1.0);

  // Edge ink: a one-texel Sobel sample, dilated by re-sampling it around a
  // ring of radius u_outline (in CSS px) and keeping the strongest hit —
  // that ring is what turns a hairline gradient into an outline-px stroke.
  float edge = step(EDGE_THRESHOLD, sobelEdge(uv, texel));
  for (int i = 0; i < 8; i++) {
    float a = 6.2831853 * float(i) / 8.0;
    vec2 off = vec2(cos(a), sin(a)) * max(u_outline, 0.0) * texel;
    edge = max(edge, step(EDGE_THRESHOLD, sobelEdge(uv + off, texel)));
  }

  // Ben-Day dots: a fixed 6px halftone grid, visible only where luminance
  // sits between 0.35 and 0.7, sized by u_dots and tinted warm off the
  // posterised local colour.
  float pitch = 6.0;
  vec2 cell = floor(px / pitch);
  vec2 cellCenter = (cell + 0.5) * pitch;
  float distToCenter = length(px - cellCenter);
  float band = smoothstep(0.35, 0.42, lumaC) * (1.0 - smoothstep(0.63, 0.7, lumaC));
  float dotRadius = clamp(pitch * 0.46 * clamp(u_dots, 0.0, 2.0) * band, 0.0, pitch * 0.48);
  float dotMask = (1.0 - smoothstep(dotRadius - 1.0, dotRadius + 0.4, distToCenter)) * band;
  vec3 warm = clamp(poster * vec3(1.12, 1.0, 0.82) + vec3(0.05, 0.02, -0.03), 0.0, 1.0);

  vec3 comic = mix(poster, warm, dotMask);
  comic = mix(comic, u_ink, edge);
  o_color = vec4(comic, mask * u_opacity);
}
`;

type LensLayerProps = Required<
  Pick<
    ComicLensProps,
    "radius" | "softness" | "levels" | "outline" | "dots" | "ink"
  >
>;

/** Walks up from the host to the first opaque background colour, so lens
 * samples over transparent texture regions composite onto the page rather
 * than onto black. Mirrors crystal-lens's effectiveBackground. */
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
function LensLayer({
  radius,
  softness,
  levels,
  outline,
  dots,
  ink,
}: LensLayerProps) {
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
  const inkRgbRef = React.useRef<[number, number, number, number]>([
    0.067, 0.067, 0.067, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, levels, outline, dots });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, levels, outline, dots };
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_levels: p.levels,
      u_outline: p.outline,
      u_dots: p.dots,
      u_ink: [inkRgbRef.current[0], inkRgbRef.current[1], inkRgbRef.current[2]],
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, opacity]);

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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, opacity].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the ink colour through the real cascade, so a token like
  // var(--ink) reads the theme in force on the host.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    inkRgbRef.current = resolveColor(ink, host);
    requestFrame();
  }, [surface.host, ink, requestFrame]);

  // Pointer on the host: spring the lens, fade in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      if (still) opacity.set(0);
      else animate(opacity, 0, { duration: 0.22 });
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
  }, [surface.host, x, y, opacity]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="comic-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A lens that reprints the interface under it as a comic panel: each
 * channel posterises to `levels` flat steps, a 3x3 Sobel pass over
 * luminance finds edges and inks them in `ink`, thickened to `outline` px
 * by dilating the edge mask over a ring of neighbour samples rather than
 * widening a line, and a fixed 6px Ben-Day grid drops warm-tinted dots
 * wherever the local luminance sits in the 0.35–0.7 midtone band, sized by
 * `dots`. The DOM underneath stays real — the panel draws over it, never
 * in place of it, so every control still clicks and focuses like itself.
 * Reduced motion: a still outline in `ink` traces the lens's own circle
 * and follows the pointer without springing; nothing under the glass is
 * redrawn.
 */
export function ComicLens({
  radius = 180,
  softness = 0.5,
  levels = 4,
  outline = 0.8,
  dots = 1,
  ink = "#111111",
  paint,
  className,
  children,
}: ComicLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          levels={levels}
          outline={outline}
          dots={dots}
          ink={ink}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
