"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
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

export type SlowBreathProps = {
  /** Seconds for one full inhale-hold-exhale cycle. @default 6 */
  period?: number;
  /** Peak magnification at the top of the breath, added to 1 — the page
   * swells by this much about its own centre. @default 0.012 */
  scale?: number;
  /** How far the page tints toward a warm hue at the top of the breath,
   * 0..1. @default 0.12 */
  warmth?: number;
  /** Seconds the breath holds at the top of the inhale before it turns
   * over into the exhale. @default 0.6 */
  hold?: number;
  /** Fill colour where the sampled texture is transparent; defaults to the
   * host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform float u_period;
uniform float u_hold;
uniform float u_scale;
uniform float u_warmth;
uniform float u_tick;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A shaped breathing cycle on the clock: inhale over the first 45% of the
// period, an eased plateau u_hold seconds long at the top, exhale over
// whatever remains. Both ramps run through smoothstep, which lands at zero
// slope at both 0 and 1 — so the curve enters and leaves the plateau
// without a seam, no separate easing needed at the joins.
float breathPhase() {
  float safePeriod = max(u_period, 0.001);
  float cycle = mod(u_tick, safePeriod);
  float inhaleEnd = safePeriod * 0.45;
  float holdEnd = inhaleEnd + max(u_hold, 0.0);
  if (cycle < inhaleEnd) {
    float u = clamp(cycle / max(inhaleEnd, 0.0001), 0.0, 1.0);
    return smoothstep(0.0, 1.0, u);
  }
  if (cycle < holdEnd) {
    return 1.0;
  }
  float exhaleDur = max(safePeriod - holdEnd, 0.0001);
  float u = clamp((cycle - holdEnd) / exhaleDur, 0.0, 1.0);
  return 1.0 - smoothstep(0.0, 1.0, u);
}

void main() {
  float phase = breathPhase();

  // Scale the sampled page about the centre — a soft, whole-interface
  // swell that peaks with the phase and relaxes back with it.
  float mag = 1.0 + u_scale * phase;
  vec2 src = (v_uv - 0.5) / max(mag, 0.0001) + 0.5;
  vec3 c = sampleOver(src);

  // Warmth rides the same phase, so even a screenshot pair too close
  // together to catch the ~4px edge motion still shows a colour shift.
  vec3 warm = vec3(1.0, 0.9098, 0.7804); // #ffe8c7
  c = mix(c, warm, clamp(u_warmth * phase, 0.0, 1.0));

  // A faint vignette that lightens toward the edges as the breath draws in.
  vec2 centered = v_uv - 0.5;
  float dist = length(centered) / 0.70710678;
  float vignette = smoothstep(0.3, 1.0, dist);
  c = mix(c, vec3(1.0), vignette * 0.12 * phase);

  o_color = vec4(c, 1.0);
}
`;

type SlowBreathLayerProps = Required<
  Pick<SlowBreathProps, "period" | "scale" | "warmth" | "hold">
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
 * The GL layer. Owns the context, the program, the page texture, the
 * breathing clock, and the frame loop; reads everything else from the
 * surface. There is no pointer here at all — the clock is the only input.
 */
function SlowBreathLayer({
  period,
  scale,
  warmth,
  hold,
  background,
}: SlowBreathLayerProps) {
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
  const paramsRef = React.useRef({ period, scale, warmth, hold });
  React.useEffect(() => {
    paramsRef.current = { period, scale, warmth, hold };
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
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_period: p.period,
      u_hold: p.hold,
      u_scale: p.scale,
      u_warmth: p.warmth,
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

  // Every completed paint asks for a fresh frame — the breath keeps ticking,
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

  // The breathing loop: a rAF tick that only exists to advance `u_tick` and
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
        // Rebase the clock over the pause so the breath resumes, not jumps.
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
      data-effect-canvas="slow-breath"
      className="block h-full w-full"
    />
  );
}

/**
 * The whole interface breathing: a shaped clock runs an inhale, an eased
 * plateau at the top, and an exhale, and that single phase drives
 * everything on screen at once — a soft zoom about the centre, a warm tint
 * mixed into the sampled page, and a faint vignette that lightens as the
 * breath draws in. Nothing here reacts to the pointer; the loop ticks on
 * its own while the surface is visible and pauses the moment it scrolls
 * off or the tab hides, the same idle shape dust-reveal's own drift field
 * uses. The canvas IS the page — the real DOM sits at zero opacity beneath
 * it, still in flow and still focusable.
 * Reduced motion: SurfacePaint shows the real DOM at full opacity and this
 * layer renders nothing.
 */
export function SlowBreath({
  period = 6,
  scale = 0.012,
  warmth = 0.12,
  hold = 0.6,
  background,
  paint,
  className,
  children,
}: SlowBreathProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SlowBreathLayer
          period={period}
          scale={scale}
          warmth={warmth}
          hold={hold}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
