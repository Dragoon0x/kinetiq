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

export type SandWindProps = {
  /** Grain coverage across the field (0..1). @default 0.5 */
  density?: number;
  /** Sideways drift speed of both grain layers. @default 1 */
  speed?: number;
  /** How hard the gust cycle swings drift speed and haze (0..1). @default 0.8 */
  gust?: number;
  /** How much a gust abrades the page with horizontal blur (0..1). @default 0.6 */
  abrade?: number;
  /** How far a gust washes the page toward the sand colour (0..1). @default 0.25 */
  haze?: number;
  /** The sand's colour — haze and grains both draw in it. @default "#d9c39a" */
  color?: string;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_density;
uniform float u_speed;
uniform float u_gust;
uniform float u_abrade;
uniform float u_haze;
uniform vec3 u_color;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;

  // Gust cycle: a slow pulse that never fully calms, driving both the
  // grains' drift speed and how deep the haze washes.
  float g = max(0.5 + 0.5 * sin(u_tick * 0.7) * u_gust, 0.2);

  // Two stretched noise layers, the second finer and faster, thresholded
  // softly so grains have soft edges rather than a hard cutoff.
  vec2 flow1 = vec2(px.x * 0.05 - u_tick * u_speed * 40.0 * g, px.y * 0.4);
  float grain1 = smoothstep(0.55, 0.8, kx_noise(flow1));

  vec2 flow2 = vec2(
    px.x * 0.12 - u_tick * u_speed * 70.0 * g + 41.3,
    px.y * 0.9 + 17.1
  );
  float grain2 = smoothstep(0.55, 0.8, kx_noise(flow2));

  float grainDensity = clamp((grain1 * 0.7 + grain2 * 0.5) * u_density, 0.0, 1.0);

  // Horizontal abrasion: thicker grain cover blurs the page harder, five
  // taps spread across a radius set by abrade and the local grain density.
  float radius = u_abrade * grainDensity * 6.0;
  vec3 blurred;
  if (radius < 0.05) {
    blurred = sampleOver(px / u_res);
  } else {
    float halfR = radius * 0.5;
    vec3 acc = vec3(0.0);
    acc += sampleOver((px + vec2(-radius, 0.0)) / u_res) * 1.0;
    acc += sampleOver((px + vec2(-halfR, 0.0)) / u_res) * 4.0;
    acc += sampleOver(px / u_res) * 6.0;
    acc += sampleOver((px + vec2(halfR, 0.0)) / u_res) * 4.0;
    acc += sampleOver((px + vec2(radius, 0.0)) / u_res) * 1.0;
    blurred = acc / 16.0;
  }

  // The gust washes the whole page toward the sand colour, then the grains
  // themselves draw over the top in that same colour at their own density.
  vec3 hazed = mix(blurred, u_color, clamp(u_haze * g, 0.0, 1.0));
  vec3 result = mix(hazed, u_color, grainDensity);

  o_color = vec4(result, 1.0);
}
`;

type SandLayerProps = Required<
  Pick<
    SandWindProps,
    "density" | "speed" | "gust" | "abrade" | "haze" | "color"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so the
 * storm's fill composites onto the page rather than onto black — the same
 * probe crystal-lens and dust-reveal use for their own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture and the
 * continuous frame loop; reads everything else from the surface. No
 * pointer here — the storm runs on its own clock.
 */
function SandLayer({
  density,
  speed,
  gust,
  abrade,
  haze,
  color,
  background,
}: SandLayerProps) {
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
  const colorRef = React.useRef<[number, number, number, number]>([
    0.85, 0.76, 0.6, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ density, speed, gust, abrade, haze });
  React.useEffect(() => {
    paramsRef.current = { density, speed, gust, abrade, haze };
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
      u_tick: tickRef.current,
      u_density: p.density,
      u_speed: p.speed,
      u_gust: p.gust,
      u_abrade: p.abrade,
      u_haze: p.haze,
      u_color: colorRef.current.slice(0, 3),
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

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The continuous loop: a rAF tick that advances u_tick and redraws every
  // frame while the surface is active, its host is on screen and the tab is
  // visible. Gated exactly like dust-reveal's idle-drift loop, but never
  // stopped for a settled value — a sandstorm doesn't settle.
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
        // Rebase the clock over the pause so the storm resumes, not jumps.
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

  // Resolve the fill and sand colours against the host's own theme whenever
  // either changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background)
      : effectiveBackground(host);
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, background, color, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="sand-wind"
      className="block h-full w-full"
    />
  );
}

/**
 * A sandstorm crossing the interface: two layers of stretched, seeded noise
 * drift sideways at a pace set by a slow gust cycle, threshold softly into
 * grains, and paint over the page in the sand colour where they gather. The
 * same gust abrades the page with a short horizontal blur — heavier where
 * the grain cover is thickest — and washes everything toward the sand
 * colour as it peaks. Nothing here reads the pointer; the field is one
 * seeded noise texture advanced by the clock, never `Math.random`, and the
 * DOM underneath sits at zero opacity, still in flow and still focusable,
 * so the page the storm crosses is the real one.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function SandWind({
  density = 0.5,
  speed = 1,
  gust = 0.8,
  abrade = 0.6,
  haze = 0.25,
  color = "#d9c39a",
  background,
  paint,
  className,
  children,
}: SandWindProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SandLayer
          density={density}
          speed={speed}
          gust={gust}
          abrade={abrade}
          haze={haze}
          color={color}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
