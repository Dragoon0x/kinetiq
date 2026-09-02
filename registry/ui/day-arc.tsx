"use client";

import * as React from "react";

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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type DayArcProps = {
  /** Seconds for one full dawn-to-dusk cycle. @default 90 */
  period?: number;
  /** Phase offset at mount, 0..1 — where along the arc the cycle starts. @default 0.15 */
  start?: number;
  /** How strongly the light ramp tints the sampled page, 0..1. @default 0.55 */
  intensity?: number;
  /** Ink-shadow length and strength multiplier, 0..1. @default 0.6 */
  shadow?: number;
  /** Fill colour where the sampled texture is transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_period;
uniform float u_start;
uniform float u_intensity;
uniform float u_shadow;
uniform float u_tick;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Four stops, linearly interpolated: dawn at p=0, noon at p=0.35, amber at
// p=0.75, dusk at p=1. The wrap from dusk back to dawn is a deliberate cut,
// not a blend — a horizon simply resets, it does not fade through itself.
vec3 dayColor(float p) {
  vec3 dawn = vec3(0.6157, 0.7059, 1.0);
  vec3 noon = vec3(1.0, 1.0, 1.0);
  vec3 amber = vec3(1.0, 0.7020, 0.4196);
  vec3 dusk = vec3(0.4196, 0.4863, 1.0);
  if (p < 0.35) {
    return mix(dawn, noon, p / 0.35);
  }
  if (p < 0.75) {
    return mix(noon, amber, (p - 0.35) / 0.40);
  }
  return mix(amber, dusk, (p - 0.75) / 0.25);
}

void main() {
  vec2 px = v_uv * u_res;
  float p = fract(u_tick / max(u_period, 0.001) + u_start);
  float e = sin(p * 3.14159265);
  vec3 light = dayColor(p);
  vec3 home = sampleOver(v_uv);

  // The whole page tints toward the day's colour and dims toward the
  // horizon, brightest when the sun sits at zenith.
  vec3 lit = home * mix(vec3(1.0), light, clamp(u_intensity, 0.0, 1.0))
    * (0.78 + 0.22 * e);

  // Ink shadow: sample the source at the spot that would cast onto this
  // pixel — offset opposite the sun, longest at the horizon and gone at
  // zenith — then darken this pixel where that source was ink and this
  // pixel is not ink itself, so a shadow only falls on the ground, never on
  // the glyph casting it.
  float dirX = sign(0.5 - p);
  vec2 offsetPx = vec2(dirX * u_shadow * (1.0 - e) * 14.0, 0.0);
  float bgLuma = kx_luma(u_bg.rgb);
  // Three taps across the cast source soften the shadow so it reads as a
  // shadow and never as a second copy of the type.
  float inkMask = 0.0;
  for (int i = -1; i <= 1; i++) {
    vec2 tap = px - offsetPx + vec2(float(i) * 1.5, float(i) * 0.75);
    vec3 castFrom = sampleOver(tap / u_res);
    inkMask += smoothstep(0.0, 0.35, bgLuma - kx_luma(castFrom));
  }
  inkMask /= 3.0;
  float selfInk = smoothstep(0.0, 0.35, bgLuma - kx_luma(home));
  vec3 shaded = lit * (1.0 - inkMask * (1.0 - selfInk) * 0.28);

  // A soft highlight riding the sun's own position near the top of the
  // frame, brightest at zenith and gone at the horizon.
  vec2 sunPos = vec2(p * u_res.x, u_res.y * 0.15);
  float sunFalloff = 1.0 - smoothstep(0.0, 120.0, length(px - sunPos));
  vec3 result = shaded + light * sunFalloff * 0.12 * e;

  o_color = vec4(result, 1.0);
}
`;

type DayArcLayerProps = Required<
  Pick<DayArcProps, "period" | "start" | "intensity" | "shadow">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black — the same probe crystal-lens and dust-reveal use. */
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
 * The GL layer. Owns the context, the program, the page texture, the day
 * clock, and the frame loop; reads everything else from the surface. There
 * is no pointer here at all — the clock is the only input.
 */
function DayArcLayer({
  period,
  start,
  intensity,
  shadow,
  background,
}: DayArcLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ period, start, intensity, shadow });
  React.useEffect(() => {
    paramsRef.current = { period, start, intensity, shadow };
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

    const sized = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = sized.width / sized.dpr;
    const cssH = sized.height / sized.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_period: p.period,
      u_start: p.start,
      u_intensity: p.intensity,
      u_shadow: p.shadow,
      u_tick: tickRef.current,
      u_bg: bg,
    });
    tri.draw();
  }, []);

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
    // tick.
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

  // Every completed paint asks for a fresh frame — the arc keeps ticking,
  // the page underneath it just gets fresher.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Background resolves against the host once it exists, and once more
  // whenever the override prop changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The day loop: a rAF tick that only exists to advance `u_tick` and
  // redraw every frame while the surface is on screen. Gated the same way
  // as the GL effect (only while the surface is active — which in replace
  // mode already folds in reduced motion, since `active` is false there
  // whenever motion is unsafe) plus IntersectionObserver/visibilitychange,
  // the same idle-loop shape dust-reveal's own drift tick uses.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

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
        // Rebase the clock over the pause so the arc resumes, not jumps.
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
  }, [surface.active, surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="day-arc"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface carried through one arc of a day: a phase clock sweeps a
 * sun from dawn through noon into dusk, its colour interpolated across four
 * ramp stops, tinting and dimming the whole sampled page as it climbs and
 * falls. Ink content casts a soft shadow away from the sun, longest at the
 * horizon and gone at zenith, and a faint highlight rides the sun's own
 * position near the top of the frame. Nothing here reacts to the pointer —
 * the clock is the only input, ticking while the surface is visible and
 * pausing the moment it scrolls off screen or the tab hides, the same idle
 * shape dust-reveal's own drift field uses. The canvas IS the page — the
 * real DOM sits at zero opacity beneath it, still in flow and still
 * focusable.
 * Reduced motion: SurfacePaint shows the real DOM at full opacity and this
 * layer renders nothing.
 */
export function DayArc({
  period = 90,
  start = 0.15,
  intensity = 0.55,
  shadow = 0.6,
  background,
  paint,
  className,
  children,
}: DayArcProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <DayArcLayer
          period={period}
          start={start}
          intensity={intensity}
          shadow={shadow}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
