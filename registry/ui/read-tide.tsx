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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type ReadTideProps = {
  /** Reading-line position, as a fraction of the viewport height (0 top, 1 bottom). @default 0.45 */
  line?: number;
  /** Soft-edge band above the line where the wash fades in, in CSS pixels. @default 48 */
  softness?: number;
  /** Wash colour for the part of the page already read. @default "#2563eb" */
  tint?: string;
  /** Wash alpha above the line. @default 0.12 */
  strength?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_lineY;
uniform float u_softness;
uniform vec4 u_tint;
uniform float u_strength;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 px = v_uv * u_res;
  float soft = max(u_softness, 0.001);

  // Above the line (py < u_lineY) the wash sits at full strength; the
  // smoothstep fades it out across the softness band right under the line,
  // and its own clamping already zeroes it at and below the line, so no
  // separate cutoff is needed for this term.
  float washT = 1.0 - smoothstep(u_lineY - soft, u_lineY, px.y);
  float washAlpha = washT * clamp(u_strength, 0.0, 1.0);

  // A small bright band straddles the line itself, masked to the read
  // side only so nothing shows on the unread side below it.
  float d = px.y - u_lineY;
  float above = step(px.y, u_lineY);
  float edgeAlpha = 0.5 * exp(-(d * d) / 18.0) * above;

  float alpha = clamp(washAlpha + edgeAlpha, 0.0, 1.0);
  vec3 color = alpha > 0.0001
    ? (u_tint.rgb * washAlpha + vec3(1.0) * edgeAlpha) / alpha
    : u_tint.rgb;

  o_color = vec4(color, alpha);
}
`;

type TideLayerProps = Required<
  Pick<ReadTideProps, "line" | "softness" | "tint" | "strength">
>;

/**
 * The GL layer. Owns the context, the program, the line's motion value and
 * the frame loop; reads everything else from the surface. Unlike a lens or
 * a print head, this effect never samples the painted texture — it is pure
 * geometry against the reading line, so no upload, no version tracking.
 */
function TideLayer({ line, softness, tint, strength }: TideLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const lineY = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const tintRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ line, softness, strength });
  React.useEffect(() => {
    paramsRef.current = { line, softness, strength };
  }, [line, softness, strength]);

  // One frame: resize the backing store to the host and draw the wash at
  // the line's current motion value.
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_lineY: lineY.get(),
      u_softness: p.softness,
      u_tint: tintRef.current,
      u_strength: p.strength,
    });
    tri.draw();
  }, [lineY]);

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
    // The line's position is very likely already known: draw it now rather
    // than waiting for the next scroll or resize.
    requestFrame();

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

  // The only loop this effect has: a frame is asked for when the line's
  // motion value changes, and nothing asks again once it settles.
  React.useEffect(() => {
    const unsub = lineY.on("change", requestFrame);
    return unsub;
  }, [lineY, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the wash colour against the host, so `var(--token)` reads the
  // theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    tintRef.current = resolveColor(tint, host);
    requestFrame();
  }, [surface.host, tint, requestFrame]);

  // Mount, scroll and resize: measure the line's host-relative position and
  // move the motion value there. The first measurement jumps straight to
  // position — nothing has settled yet for a spring to move from.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const computeLineY = (): number => {
      const rect = host.getBoundingClientRect();
      return window.innerHeight * paramsRef.current.line - rect.top;
    };

    lineY.jump(computeLineY());

    const still = !surfaceRef.current.motionSafe;
    const update = (): void => {
      const target = computeLineY();
      if (still) lineY.jump(target);
      else animate(lineY, target, springs.glide);
    };

    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [surface.host, lineY]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="read-tide"
      className="block h-full w-full"
    />
  );
}

/**
 * A wash that marks how far down the page the reader has gone. A line at
 * `line` of the viewport height is measured against the host on mount, on
 * every scroll and on every resize, then sprung onto a motion value on
 * `springs.glide`; everything above it — the part already scrolled past —
 * carries `tint` at `strength` alpha, fading out over `softness` pixels
 * right where the line sits, with a faint brighter band marking the line
 * itself. The wash never samples the page underneath it: it is pure
 * geometry against a scroll position, so nothing under the glass is
 * distorted, only marked. A frame is drawn only when the line's motion
 * value changes, so the canvas goes idle the moment scrolling stops.
 * Reduced motion: the line still moves on every scroll and resize, it
 * simply jumps to position instead of springing there.
 */
export function ReadTide({
  line = 0.45,
  softness = 48,
  tint = "#2563eb",
  strength = 0.12,
  paint,
  className,
  children,
}: ReadTideProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <TideLayer
          line={line}
          softness={softness}
          tint={tint}
          strength={strength}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
