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

export type DuotoneWashProps = {
  /** Shadow-end colour of the duotone ramp. @default "#1b2a4a" */
  shadow?: string;
  /** Light-end colour of the duotone ramp. @default "#ffd166" */
  light?: string;
  /** Resting gradient angle in degrees, before the pointer adds its own turn. @default 0 */
  angle?: number;
  /** How far the wash commits over the true page colour (0..1). @default 0.15 */
  mix?: number;
  /** Luma contrast applied before the ramp reads it. @default 0.2 */
  contrast?: number;
  /** Fill for regions where the painted texture is transparent. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec4 u_bg;
uniform vec3 u_shadow;
uniform vec3 u_light;
uniform float u_angle;
uniform float u_mix;
uniform float u_contrast;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

void main() {
  vec4 texel = texture(u_tex, v_uv);
  vec3 page = mix(u_bg.rgb, texel.rgb, texel.a);

  // Luma pushed away from (or toward) the midpoint before the ramp reads
  // it, so contrast sharpens or flattens which regions land light vs dark.
  float luma = kx_luma(page);
  float lp = clamp((luma - 0.5) * (1.0 + u_contrast) + 0.5, 0.0, 1.0);

  // A gradient run through the ramp along u_angle, added to the luma term
  // so the wash reads as one tilted print, not a flat tint.
  vec2 dir = vec2(cos(u_angle), sin(u_angle));
  float t = lp + dot(v_uv - 0.5, dir) * 0.35;

  vec3 duo = mix(u_shadow, u_light, clamp(t, 0.0, 1.0));
  vec3 result = mix(page, duo, clamp(u_mix, 0.0, 1.0));
  o_color = vec4(result, 1.0);
}
`;

/** Shortest signed delta, in degrees, from `from` to `to`, wrapped into
 * [-180, 180]. Adding it to `from` gives a continuous, unwrapped target —
 * so springing the gradient angle toward a pointer near the ±180° seam
 * never spins the long way around. */
function shortestAngleDelta(from: number, to: number): number {
  let diff = (to - from) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

/** Walks up from the host to the first opaque background colour, so a
 * transparent region of the painted texture composites onto the page
 * rather than onto black — the same probe crystal-lens uses. */
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

type WashLayerProps = Required<
  Pick<DuotoneWashProps, "shadow" | "light" | "angle" | "mix" | "contrast">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the texture, the pointer's
 * sprung angle, and the frame loop; reads everything else from the surface.
 */
function WashLayer({
  shadow,
  light,
  angle,
  mix,
  contrast,
  background,
}: WashLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // The pointer's contribution to the gradient angle, in degrees, sprung
  // and relaxing back to 0 (no contribution) once the pointer leaves.
  const pointerAngle = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const shadowRef = React.useRef<[number, number, number]>([
    0.1059, 0.1647, 0.2902,
  ]);
  const lightRef = React.useRef<[number, number, number]>([1, 0.8196, 0.4]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ angle, mix, contrast });
  React.useEffect(() => {
    paramsRef.current = { angle, mix, contrast };
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

    resizeGL(gl, canvas, { dprCap: 2 });
    const p = paramsRef.current;
    const bg = bgRef.current;
    const totalAngleRad = ((p.angle + pointerAngle.get()) * Math.PI) / 180;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_bg: bg,
      u_shadow: shadowRef.current,
      u_light: lightRef.current,
      u_angle: totalAngleRad,
      u_mix: p.mix,
      u_contrast: p.contrast,
    });
    tri.draw();
  }, [pointerAngle]);

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

  // The sprung angle asks for a frame on every tick while it settles, and
  // stops asking the moment the spring is at rest — that's the whole loop.
  React.useEffect(() => {
    const unsub = pointerAngle.on("change", requestFrame);
    return () => unsub();
  }, [pointerAngle, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours resolve against the host once it exists, and again whenever the
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const shadowRgba = resolveColor(shadow, host);
    shadowRef.current = [shadowRgba[0], shadowRgba[1], shadowRgba[2]];
    const lightRgba = resolveColor(light, host);
    lightRef.current = [lightRgba[0], lightRgba[1], lightRgba[2]];
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, shadow, light, background, requestFrame]);

  // Pointer on the host: spring the gradient angle toward the line from the
  // host's centre to the pointer, and relax it back to 0 — no pointer
  // contribution, the ramp resting on `angle` alone — once the pointer
  // leaves.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const springTo = (targetDeg: number) => {
      const current = pointerAngle.get();
      const next = current + shortestAngleDelta(current, targetDeg);
      animate(pointerAngle, next, springs.glide);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dx = event.clientX - rect.left - rect.width / 2;
      const dy = event.clientY - rect.top - rect.height / 2;
      springTo((Math.atan2(dy, dx) * 180) / Math.PI);
    };
    const leave = () => springTo(0);

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, pointerAngle]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="duotone-wash"
      className="block h-full w-full"
    />
  );
}

/**
 * The live interface printed as a duotone: every pixel's luminance decides
 * where it falls between `shadow` and `light`, run through a gradient whose
 * angle is `angle` plus the line from the host's centre to the pointer —
 * that pointer term is a spring, so the print tilts as the cursor sweeps
 * past and settles back to `angle`'s own line the moment it leaves.
 * `contrast` pushes each pixel's luminance away from (or toward) the
 * midpoint before the ramp reads it, sharpening or flattening which
 * regions read light versus dark; `mix` blends the two-colour result back
 * over the true page colour, so a low value leaves the interface mostly
 * itself with a tint and a high one commits to the print. Nothing here is
 * seeded or simulated — every sample reads straight off the painted
 * texture, and the only thing that ever animates is the gradient's own
 * angle, which stops requesting frames the instant it settles.
 * Reduced motion: `SurfacePaint` renders in replace mode, so this layer
 * returns null and the real, untinted DOM shows in its place.
 */
export function DuotoneWash({
  shadow = "#1b2a4a",
  light = "#ffd166",
  angle = 0,
  mix = 0.15,
  contrast = 0.2,
  background,
  paint,
  className,
  children,
}: DuotoneWashProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <WashLayer
          shadow={shadow}
          light={light}
          angle={angle}
          mix={mix}
          contrast={contrast}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
