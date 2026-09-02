"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import type { PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type GlareSweepProps = {
  /** Band half-width in CSS pixels — the falloff scale for the main streak; the trailing echo uses twice this. @default 70 */
  width?: number;
  /** Peak alpha of the main streak at its centre, and of the hairline riding its crest. @default 0.55 */
  intensity?: number;
  /** Degrees of tilt for the band's normal — the streak itself runs perpendicular to it. @default -24 */
  angle?: number;
  /** Peak alpha of the fainter streak trailing the main one. @default 0.25 */
  secondary?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec2 u_normal;
uniform float u_center;
uniform float u_width;
uniform float u_intensity;
uniform float u_secondary;
in vec2 v_uv;
out vec4 o_color;

// White with a faint blue cast — the colour of a glare riding glass.
const vec3 TINT = vec3(0.9176, 0.9490, 1.0);

void main() {
  vec2 px = v_uv * u_res;
  float w = max(u_width, 1.0);
  float d = dot(px, u_normal) - u_center;

  float t = d / w;
  float band = exp(-(t * t)) * u_intensity;
  float s = (d + w * 2.2) / (w * 2.0);
  float trail = exp(-(s * s)) * u_secondary;
  float alpha = clamp(band + trail, 0.0, 1.0);

  // A hairline riding the crest of the main band, brighter than the tint
  // around it, so the streak reads as a reflection rather than a gradient.
  float crest = (1.0 - smoothstep(0.0, 1.5, abs(d))) * 0.75;
  vec3 color = mix(TINT, vec3(1.0), crest);

  o_color = vec4(color, alpha);
}
`;

type GlareLayerProps = Required<
  Pick<GlareSweepProps, "width" | "intensity" | "angle" | "secondary">
>;

// Sentinel: far enough along any normal that the band's gaussian falloff is
// effectively zero for every on-screen pixel, until the pointer first enters.
const OFFSCREEN_CENTER = -9999;

/**
 * The GL layer. Owns the context, the program, the centre spring, and the
 * frame loop; reads everything else from the surface. The band never
 * samples the painted texture — it is a pure additive tint over the real
 * DOM, so there is nothing to upload or bend, and no sampler uniform at all.
 */
function GlareLayer({ width, intensity, angle, secondary }: GlareLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const center = useMotionValue<number>(OFFSCREEN_CENTER);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ width, intensity, angle, secondary });
  React.useEffect(() => {
    paramsRef.current = { width, intensity, angle, secondary };
  });

  // One frame: read the current centre and params, draw the band.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    if (!gl || !program || !tri || !canvas) return;
    if (gl.isContextLost()) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const rad = (p.angle * Math.PI) / 180;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_normal: [Math.cos(rad), Math.sin(rad)],
      u_center: center.get(),
      u_width: p.width,
      u_intensity: p.intensity,
      u_secondary: p.secondary,
    });
    tri.draw();
  }, [center]);

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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw now rather than on the next
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The centre spring asks for a frame on every step and stops asking the
  // moment it settles — the whole loop lives inside this subscription, with
  // no separate self-rescheduling function.
  React.useEffect(() => {
    const unsub = center.on("change", requestFrame);
    return unsub;
  }, [center, requestFrame]);

  // A resize or a DOM change bumps the surface's own version; redraw so the
  // canvas backing store tracks the host's box, even though the band itself
  // never reads the painted texture.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: spring the band's centre to the pointer's
  // projection onto the tilt normal while inside, and slide it off past the
  // edge when the pointer leaves. Reduced motion jumps instead of springing.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const still = !surfaceRef.current.motionSafe;

    const project = (event: PointerEvent): number => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const rad = (paramsRef.current.angle * Math.PI) / 180;
      return px * Math.cos(rad) + py * Math.sin(rad);
    };
    const move = (event: PointerEvent) => {
      const target = project(event);
      if (still) center.set(target);
      else animate(center, target, springs.glide);
    };
    const leave = () => {
      const target = -paramsRef.current.width * 4;
      if (still) center.set(target);
      else animate(center, target, springs.glide);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, center]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="glare-sweep"
      className="block h-full w-full"
    />
  );
}

/**
 * A glare crossing glass laid over the interface: a bright band runs along a
 * fixed tilt, its centre chasing wherever the pointer's projection onto that
 * tilt falls, trailing a fainter, wider echo behind it and carrying a thin
 * bright line at its own crest. Nothing underneath is sampled or bent — the
 * band is a pure white-blue tint added on top of the real DOM, so every
 * click and field still lands on the actual element beneath the glass. The
 * centre is a single spring that only asks for another frame while it is
 * still moving; once it settles the loop stops on its own, and leaving the
 * surface sends the band sliding off past the edge rather than fading in
 * place.
 * Reduced motion: the centre jumps straight to the pointer's projection
 * instead of springing, so the glare still tracks the cursor but never eases
 * or slides.
 */
export function GlareSweep({
  width = 70,
  intensity = 0.55,
  angle = -24,
  secondary = 0.25,
  paint,
  className,
  children,
}: GlareSweepProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <GlareLayer
          width={width}
          intensity={intensity}
          angle={angle}
          secondary={secondary}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
