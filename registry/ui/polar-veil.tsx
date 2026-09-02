"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type PolarVeilProps = {
  /** How far down from the host's top edge the curtain reaches, in CSS pixels — it dissolves into nothing by this depth. @default 260 */
  height?: number;
  /** Animation speed multiplier for the drifting rays. @default 1 */
  speed?: number;
  /** How far a slow fold noise warps the ray field sideways before it feeds the main fbm; 0 removes the buckle. @default 1 */
  fold?: number;
  /** Cooler curtain colour, resolved against the host so a var(--token) reads the theme in force there. @default "#4ade80" */
  green?: string;
  /** Warmer curtain colour the rays drift into. @default "#a78bfa" */
  violet?: string;
  /** Overall brightness — scales alpha before the ray comb and the edge fade. @default 1 */
  intensity?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_height;
uniform float u_speed;
uniform float u_fold;
uniform float u_intensity;
uniform vec3 u_green;
uniform vec3 u_violet;
uniform float u_tick;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

void main() {
  vec2 px = v_uv * u_res;
  float h = max(u_height, 1.0);
  float t = u_still > 0.5 ? 0.0 : u_tick;

  // The curtain only ever lives in the top h px; the fade starts a little
  // before the boundary so it dissolves into the page instead of clipping.
  float edgeFade = 1.0 - smoothstep(h * 0.82, h, px.y);
  if (edgeFade <= 0.0) {
    o_color = vec4(0.0);
    return;
  }

  // A slow field warps the ray field sideways before it drives the main
  // fbm, so the curtain buckles instead of sliding as one flat sheet.
  float foldNoise = kx_fbm(vec2(px.x * 0.001, t * 0.05));
  float n = kx_fbm(vec2(
    px.x * 0.003 + u_fold * foldNoise,
    t * u_speed * 0.1
  ));

  // Vertical shape: a gentler falloff from the very top of the region (a
  // lower exponent lets light reach further down toward h) plus a brighter
  // hem near 0.15 * h — the lower edge of the curtains, where they read as
  // thickest before streaming up and out.
  float vertical = pow(clamp(1.0 - px.y / h, 0.0, 1.0), 1.2);
  float hemDist = px.y - h * 0.15;
  float hem = exp(-(hemDist * hemDist) / (h * h * 0.02));
  // The base band's contribution is boosted 1.6x so the hem reads with real
  // presence rather than fading into a smudge.
  float shape = clamp(vertical + hem * 1.04, 0.0, 1.3);

  float brightness = clamp(n * shape, 0.0, 1.0);

  // A second, slower field decides how far the colour has drifted from
  // green toward violet, independent of the ray noise above it.
  float colorNoise = kx_fbm(vec2(
    px.x * 0.0015 + 40.0,
    t * u_speed * 0.03 + 12.0
  ));
  vec3 color = mix(u_green, u_violet, clamp(colorNoise, 0.0, 1.0));
  // Push toward the fully saturated version of this hue instead of letting
  // it drift toward white: a translucent pastel composited over a light
  // page washes out to near-invisible, but a saturated tone still reads as
  // colour at the same alpha.
  float colorLuma = dot(color, vec3(0.299, 0.587, 0.114));
  color = clamp(mix(vec3(colorLuma), color, 1.6), 0.0, 1.0);

  // A faint vertical ray structure, phase-shifted by the brightness noise
  // so the rays never line up into a static grille.
  float rays = 0.6 + 0.4 * sin(px.x * 0.08 + n * 4.0);

  float alpha = brightness * u_intensity * rays * edgeFade;
  o_color = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

type PolarVeilLayerProps = Required<
  Pick<
    PolarVeilProps,
    "height" | "speed" | "fold" | "green" | "violet" | "intensity"
  >
>;

/**
 * The GL layer. Owns the context, the program, the idle tick and the frame
 * loop; reads everything else from the surface. No page texture is
 * sampled here — the shader only ever paints the curtain and fades to
 * alpha 0 below it, so there is nothing under it for a texture to feed.
 */
function PolarVeilLayer({
  height,
  speed,
  fold,
  green,
  violet,
  intensity,
}: PolarVeilLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const greenRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const violetRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ height, speed, fold, intensity });
  React.useEffect(() => {
    paramsRef.current = { height, speed, fold, intensity };
  });

  // One frame: size the canvas to the host, then draw the curtain.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
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
      u_height: p.height,
      u_speed: p.speed,
      u_fold: p.fold,
      u_intensity: p.intensity,
      u_green: greenRef.current,
      u_violet: violetRef.current,
      u_tick: tickRef.current,
      u_still: live.motionSafe ? 0 : 1,
    });
    tri.draw();
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
    // A paint may already be waiting: draw the curtain now rather than on
    // the next tick.
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

  // Every completed paint re-measures the host with a redraw — the canvas
  // resizes with it even though nothing about the curtain reads the
  // painted pixels themselves.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours resolve against the host so a var(--token) reads the theme in
  // force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const g = resolveColor(green, host);
    const v = resolveColor(violet, host);
    greenRef.current = [g[0], g[1], g[2]];
    violetRef.current = [v[0], v[1], v[2]];
    requestFrame();
  }, [surface.host, green, violet, requestFrame]);

  // Continuous idle loop: the curtain never stops drifting while it is
  // visible. Gated the same way as the GL effect (only while the surface
  // is active) plus IntersectionObserver/visibilitychange. Reduced motion
  // never starts the loop — one still frame stands in for it instead.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    if (!surface.motionSafe) {
      requestFrame();
      return;
    }

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the curtain resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncLoop();
    });
    intersection.observe(host);
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    surface.active,
    surface.host,
    surface.motionSafe,
    drawFrame,
    requestFrame,
  ]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="polar-veil"
      className="block h-full w-full"
    />
  );
}

/**
 * An aurora hung across the top `height` px of the host: a slow fold noise
 * warps a faster fbm field sideways before it sets each ray's brightness,
 * a third, slower field decides how far the colour has drifted from
 * `green` toward `violet`, and a low sine comb across x keeps the rays
 * from reading as one flat wash. The curtain is brightest along a hem near
 * 0.15 × `height` and fades both toward the very top and past `height`,
 * where it dissolves rather than clips. No page texture is sampled — the
 * shader is pure procedural light, alpha 0 everywhere below the curtain.
 * Reduced motion: the field freezes to its t = 0 shape, one still aurora
 * frame with nothing drifting.
 */
export function PolarVeil({
  height = 260,
  speed = 1,
  fold = 1,
  green = "#4ade80",
  violet = "#a78bfa",
  intensity = 1,
  paint,
  className,
  children,
}: PolarVeilProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <PolarVeilLayer
          height={height}
          speed={speed}
          fold={fold}
          green={green}
          violet={violet}
          intensity={intensity}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
