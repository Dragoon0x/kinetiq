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

export type TideLineProps = {
  /** Seconds for one full low-to-high-to-low cycle. @default 40 */
  period?: number;
  /** Waterline at high tide, a fraction of the height measured from the top — a smaller fraction sits higher on the page. @default 0.45 */
  high?: number;
  /** Waterline at low tide, a fraction of the height measured from the top. @default 0.95 */
  low?: number;
  /** Water colour, mixed into the refracted surface below the line. @default "#3b82f6" */
  tint?: string;
  /** Foam brightness at the waterline (0..1). @default 0.8 */
  foam?: number;
  /** Multiplier on the 2px refraction offset below the line. @default 1 */
  refraction?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_period;
uniform float u_high;
uniform float u_low;
uniform vec4 u_tint;
uniform float u_foam;
uniform float u_refraction;
uniform float u_wetY;
uniform float u_still;
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

  // The waterline: a slow sinusoid between the low and high fractions, plus
  // a short travelling ripple along x. Reduced motion drops the ripple, and
  // the tide settles at the sinusoid's own midpoint (the tick never
  // advances, and sin(0) is 0) -- one resting line, nothing crossing it.
  float phase = sin(u_tick * 6.2831853 / u_period);
  float baseY = mix(u_low, u_high, 0.5 + 0.5 * phase) * u_res.y;
  float ripple = u_still > 0.5 ? 0.0 : sin(px.x * 0.02 + u_tick) * 6.0;
  float lineY = baseY + ripple;

  // Foam: an 8px band straddling the line, brightened by a noise field the
  // tick keeps moving through, so the edge never sits perfectly flat.
  float foamBand = 1.0 - smoothstep(3.0, 4.0, abs(px.y - lineY));
  float foamNoise = kx_noise(vec2(px.x * 0.15, u_tick * 2.2));
  float foamAlpha = foamBand * foamNoise * u_foam;

  // Wet sand: the gap between the current line and u_wetY, the highest the
  // tide has reached lately (tracked on the CPU as a running minimum that
  // decays back toward the line). Empty while the tide rises, widest right
  // after a peak, and it closes on its own as the memory fades.
  float wetTop = min(u_wetY, lineY);
  float inWet = step(wetTop, px.y) * (1.0 - step(lineY, px.y));
  float wetAlpha = inWet * 0.08;

  // Underwater: the live surface, refracted by a shallow sine offset and
  // washed toward the tint, so the DOM keeps reading through the water --
  // bent and coloured, never hidden.
  float underwater = step(lineY, px.y);
  vec2 refractOff = vec2(sin(px.y * 0.05 + u_tick * 1.4) * 2.0 * u_refraction, 0.0);
  vec3 refracted = sampleOver((px + refractOff) / u_res);
  vec3 underwaterColor = mix(refracted, u_tint.rgb, 0.35);

  vec3 color = vec3(0.0);
  float alpha = 0.0;
  if (wetAlpha > 0.0) {
    color = u_tint.rgb * 0.4;
    alpha = wetAlpha;
  }
  if (underwater > 0.5) {
    color = underwaterColor;
    alpha = 1.0;
  }
  color = mix(color, vec3(1.0), foamAlpha);
  alpha = max(alpha, foamAlpha);

  o_color = vec4(color, alpha);
}
`;

type TideLayerProps = Required<
  Pick<
    TideLineProps,
    "period" | "high" | "low" | "tint" | "foam" | "refraction"
  >
>;

/** Walks up from the host to the first opaque background colour, so a
 * refracted sample over a transparent texture region composites onto the
 * page rather than onto black -- the same probe crystal-lens and dust-reveal
 * each keep their own copy of. */
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

const TAU = Math.PI * 2;

/** Per-frame ease rate the high-water mark decays toward the current line
 * at -- small, so the wet band lingers for a few seconds after a peak
 * instead of snapping shut. */
const WET_DECAY = 0.01;

/**
 * The GL layer. Owns the context, the program, the texture, the tide clock
 * and the frame loop; reads everything else from the surface. There is no
 * pointer here -- the tide runs on its own.
 */
function TideLayer({
  period,
  high,
  low,
  tint,
  foam,
  refraction,
}: TideLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  // The highest the waterline has reached recently, in CSS px from the top;
  // null until the first frame seeds it to the current line (zero gap).
  const wetYRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const tintRef = React.useRef<[number, number, number, number]>([
    0.231, 0.51, 0.965, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ period, high, low, foam, refraction });
  React.useEffect(() => {
    paramsRef.current = { period, high, low, foam, refraction };
  });

  // One frame: upload the texture if a new paint landed, advance the
  // high-water mark, then draw.
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
    const still = !live.motionSafe;
    const tick = tickRef.current;

    // Mirrors the shader's own mix(u_low, u_high, 0.5 + 0.5*sin(...)) so the
    // high-water mark tracks the same line the fragment shader draws. A new
    // high replaces the mark instantly; otherwise it decays toward the
    // current line (frozen under reduced motion, since nothing should move).
    const s = 0.5 + 0.5 * Math.sin((tick * TAU) / p.period);
    const baseY = (p.low + (p.high - p.low) * s) * cssH;
    const previousWetY = wetYRef.current;
    const wetY =
      previousWetY === null || baseY < previousWetY
        ? baseY
        : still
          ? previousWetY
          : previousWetY + (baseY - previousWetY) * WET_DECAY;
    wetYRef.current = wetY;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_tick: tick,
      u_period: p.period,
      u_high: p.high,
      u_low: p.low,
      u_tint: tintRef.current,
      u_foam: p.foam,
      u_refraction: p.refraction,
      u_wetY: wetY,
      u_still: still ? 1 : 0,
      u_bg: bgRef.current,
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
    // tide tick.
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

  // Every completed paint asks for a frame, so the underwater surface keeps
  // up with the live DOM even while the loop below is stopped.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours resolve from the host once, and again whenever `tint` or the
  // host itself changes; a redraw picks the new colour up immediately.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    tintRef.current = resolveColor(tint, host);
    requestFrame();
  }, [surface.host, tint, requestFrame]);

  // The one continuous loop: while the surface is active, the host is in
  // view, the tab is visible, and motion is allowed, a tick advances the
  // waterline every frame. Reduced motion never starts it -- the layer's
  // single resting frame comes from the effects above and nothing loops.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;
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
        // Rebase the clock over the pause so the tide resumes, not jumps.
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
  }, [surface.active, surface.host, surface.motionSafe, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="tide-line"
      className="block h-full w-full"
    />
  );
}

/**
 * A tide over the interface: the waterline eases between `low` and `high`
 * on a slow sine, riding a short travelling ripple, and everything below it
 * reads as the live surface seen through shallow water -- refracted by a
 * sine offset and washed toward `tint`. A noisy foam band rides the exact
 * edge, and a darker, translucent band of wet sand lingers just above it,
 * marking the highest point the tide reached before easing back down as
 * that memory decays. The DOM itself never moves or hides; only the water
 * reading it does, one continuous tick at a time.
 * Reduced motion: the tide settles at the midpoint between `low` and
 * `high`, holds there with no ripple and no wet band, and the loop never
 * starts.
 */
export function TideLine({
  period = 40,
  high = 0.45,
  low = 0.95,
  tint = "#3b82f6",
  foam = 0.8,
  refraction = 1,
  paint,
  className,
  children,
}: TideLineProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <TideLayer
          period={period}
          high={high}
          low={low}
          tint={tint}
          foam={foam}
          refraction={refraction}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
