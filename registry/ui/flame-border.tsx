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

export type FlameBorderProps = {
  /** Flame band width, inset from the edge, in CSS pixels. @default 48 */
  width?: number;
  /** Overall flame brightness — scales the noise field before it hits the colour ramp. @default 1 */
  intensity?: number;
  /** Animation speed multiplier for the licking flames. @default 1 */
  speed?: number;
  /** Flame colour; resolved against the host so a var(--token) reads the theme in force there. @default "var(--warn)" */
  color?: string;
  /** Interior glow strength — a low-alpha warm wash reaching twice as deep as the flame band. @default 0.4 */
  glow?: number;
  /** Corner radius override, in CSS pixels. Defaults to the host's own computed border-radius (its top-left value). */
  corner?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_corner;
uniform float u_width;
uniform float u_intensity;
uniform float u_speed;
uniform float u_glow;
uniform vec3 u_color;
uniform float u_tick;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

// Signed distance to a box centred on the origin, half-size b, corners
// rounded by radius r — negative inside, zero at the edge, positive
// outside. One radius for every corner keeps the flame band exactly as
// even turning a corner as it is along a straight edge.
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 halfSize = u_res * 0.5;
  float r = clamp(u_corner, 0.0, min(halfSize.x, halfSize.y));
  vec2 p = px - halfSize;
  float d = sdRoundBox(p, halfSize, r);
  float inward = -d;

  float t = u_still > 0.5 ? 0.0 : u_tick;

  // Angle around the centre turned into an arc-length-ish parameter, so the
  // noise field reads as one continuous ring instead of warping at corners.
  float angle = atan(p.y, p.x);
  float perimeter = 2.0 * (u_res.x + u_res.y);
  float along = angle * perimeter / 6.2831853;

  float falloff = 1.0 - smoothstep(0.0, u_width, max(inward, 0.0));
  float noise = kx_fbm(vec2(along * 0.02, inward * 0.03 - t * u_speed * 1.2));
  float flame = clamp(noise * falloff * u_intensity, 0.0, 1.4);

  // Colour ramp, driven by the flame value itself: transparent, into a deep
  // tint of the base colour, into that colour pushed toward yellow, into
  // white right at its hottest — the ramp naturally tapers to nothing at
  // u_width px inward because falloff already zeroed flame there.
  // Fire is not one colour: ember red at the base, the token's warmth
  // through the body, orange into yellow at the tips, a pale core.
  vec3 deep = mix(vec3(0.55, 0.08, 0.02), u_color * 0.6, 0.3);
  vec3 bright = mix(
    vec3(1.0, 0.46, 0.08),
    clamp(u_color * 1.2 + vec3(0.3, 0.15, -0.15), 0.0, 1.0),
    0.45
  );
  vec3 hot = vec3(1.0, 0.95, 0.8);
  vec3 flameColor = mix(vec3(0.0), deep, smoothstep(0.0, 0.25, flame));
  flameColor = mix(flameColor, bright, smoothstep(0.25, 0.65, flame));
  flameColor = mix(flameColor, hot, smoothstep(0.65, 1.0, flame));
  float flameAlpha = smoothstep(0.0, 0.18, flame);

  // Interior glow: a low-alpha warm wash reaching twice as deep as the
  // flame band, composited underneath it.
  float glowFalloff = 1.0 - smoothstep(0.0, u_width * 2.0, max(inward, 0.0));
  float glowAlpha = glowFalloff * u_glow * 0.35;
  vec3 glowColor = u_color;
  float aGlowUnder = flameAlpha + glowAlpha * (1.0 - flameAlpha);
  vec3 cGlowUnder = (flameColor * flameAlpha + glowColor * glowAlpha * (1.0 - flameAlpha))
    / max(aGlowUnder, 0.0001);

  // A thin hot rim right at the boundary, brighter than the ramp beneath it.
  float rim = 1.0 - smoothstep(0.0, 1.5, abs(d));
  vec3 rimColor = mix(vec3(1.0), u_color, 0.15);
  float rimAlpha = rim * clamp(u_intensity, 0.0, 1.5) * 0.85;
  float aOut = rimAlpha + aGlowUnder * (1.0 - rimAlpha);
  vec3 cOut = (rimColor * rimAlpha + cGlowUnder * aGlowUnder * (1.0 - rimAlpha))
    / max(aOut, 0.0001);

  float insideMask = 1.0 - smoothstep(0.0, 1.5, d);
  o_color = vec4(cOut, aOut * insideMask);
}
`;

type FlameBorderLayerProps = Required<
  Pick<FlameBorderProps, "width" | "intensity" | "speed" | "color" | "glow">
> & { corner?: number };

/** The host's own `border-top-left-radius`, in CSS pixels — the shader
 * assumes one uniform radius per box, matching how a host typically rounds
 * itself. */
function hostCornerRadius(host: HTMLElement): number {
  const parsed = parseFloat(getComputedStyle(host).borderTopLeftRadius);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The GL layer. Owns the context, the program, the idle-flame tick and the
 * frame loop; reads everything else from the surface. No page texture is
 * sampled here — the shader only ever paints the border and its glow, alpha
 * 0 everywhere else, so there is nothing under it for a texture to feed.
 */
function FlameBorderLayer({
  width,
  intensity,
  speed,
  color,
  glow,
  corner,
}: FlameBorderLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const colorRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const cornerRef = React.useRef(0);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ width, intensity, speed, glow });
  React.useEffect(() => {
    paramsRef.current = { width, intensity, speed, glow };
  });

  // One frame: size the canvas to the host, then draw the ring.
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
      u_corner: cornerRef.current,
      u_width: p.width,
      u_intensity: p.intensity,
      u_speed: p.speed,
      u_glow: p.glow,
      u_color: colorRef.current,
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
    // A paint may already be waiting: draw the ring now rather than on the
    // next tick.
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
  // resizes with it even though nothing about the ring reads the painted
  // pixels themselves.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colour resolves against the host so a var(--token) reads the theme in
  // force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Corner radius: the `corner` prop wins outright; otherwise read the
  // host's own computed border-radius so the ring always traces its shape.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    cornerRef.current = corner ?? hostCornerRadius(host);
    requestFrame();
  }, [surface.host, corner, requestFrame]);

  // Continuous idle loop: the fire never stops while the ring is visible.
  // Gated the same way as the GL effect (only while the surface is active)
  // plus IntersectionObserver/visibilitychange. Reduced motion never starts
  // the loop — one still frame stands in for it instead.
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
        // Rebase the clock over the pause so the flames resume, not jump.
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
      data-effect-canvas="flame-border"
      className="block h-full w-full"
    />
  );
}

/**
 * A ring of fire traced around the host's own rounded box: the band is a
 * signed distance to the rounded rectangle, so the flames burn exactly as
 * evenly around a corner as they do along a straight edge. Turbulent noise
 * licks inward from every side onto a warm colour ramp — a deep tint of
 * `color`, then that colour pushed toward yellow, then white right at the
 * boundary — while a soft interior glow reaches twice as far to warm the
 * space the flames themselves do not quite reach. The centre stays
 * completely untouched: only the border and its glow carry any colour,
 * everywhere else the canvas is fully transparent, so the interface
 * underneath reads exactly as it always did.
 * Reduced motion: the ring holds a single still frame at t = 0 — the same
 * shape, no licking flame, no drift.
 */
export function FlameBorder({
  width = 48,
  intensity = 1,
  speed = 1,
  color = "var(--warn)",
  glow = 0.4,
  corner,
  paint,
  className,
  children,
}: FlameBorderProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <FlameBorderLayer
          width={width}
          intensity={intensity}
          speed={speed}
          color={color}
          glow={glow}
          corner={corner}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
