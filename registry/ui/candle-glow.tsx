"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type CandleGlowProps = {
  /** Flame position, as [x, y] fractions of the host (0..1 each); a click on the host moves it here. @default [0.5, 0.92] */
  position?: [number, number];
  /** How far the light reaches in CSS pixels before the dark wash takes back over. @default 260 */
  radius?: number;
  /** Warm tint bled into the lit pool, any CSS colour. @default "#ffb56b" */
  warmth?: string;
  /** Flicker strength; 0 holds the light steady even with motion on. @default 1 */
  flicker?: number;
  /** Overlay darkness outside the light (0..1). @default 0.8 */
  darkness?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec3 u_flame;
uniform float u_darkness;
uniform vec3 u_warmth;
uniform float u_flicker;
uniform float u_tick;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

void main() {
  vec2 px = v_uv * u_res;
  float radius = max(u_flame.z, 1.0);
  float dist = length(px - u_flame.xy);

  // Two layered noise terms off the tick alone, never a JS random call: a
  // slow wide sway plus a quick small tremor, both silenced under reduced
  // motion so the wick holds one steady level.
  float light = 1.0;
  if (u_still < 0.5) {
    light += (kx_noise(vec2(u_tick * 0.8, 1.0)) - 0.5) * 0.3 * u_flicker;
    light += (kx_noise(vec2(u_tick * 9.0, 7.0)) - 0.5) * 0.1 * u_flicker;
  }

  // How much of the flame's light reaches this pixel: an exponential pool
  // rather than a smoothstepped disc, so the glow has no hard rim.
  float beam = clamp(exp(-dist / radius * 1.6) * light * 1.3, 0.0, 1.0);

  // Two straight-alpha layers composited into one fragment: a dark wash
  // that thins toward the flame, then a warm tint bled in at a fraction of
  // that same reach. No flame glyph is drawn — the light alone marks it.
  float darkAlpha = clamp(u_darkness, 0.0, 1.0) * (1.0 - beam);
  float warmAlpha = 0.12 * beam;
  float outAlpha = warmAlpha + darkAlpha * (1.0 - warmAlpha);
  vec3 outColor = outAlpha > 0.0001 ? (u_warmth * warmAlpha) / outAlpha : vec3(0.0);
  o_color = vec4(outColor, outAlpha);
}
`;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

type FlameLayerProps = Required<
  Pick<
    CandleGlowProps,
    "position" | "radius" | "warmth" | "flicker" | "darkness"
  >
>;

/**
 * The GL layer. Owns the context, the program, the flame's position spring,
 * the wick clock, and the frame loop; nothing here ever samples the painted
 * texture — the flame only conjures a vignette over the DOM, it never reads
 * or bends it.
 */
function FlameLayer({
  position,
  radius,
  warmth,
  flicker,
  darkness,
}: FlameLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(position[0]);
  const y = useMotionValue<number>(position[1]);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const warmthRef = React.useRef<[number, number, number]>([1, 0.71, 0.42]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, flicker, darkness });
  React.useEffect(() => {
    paramsRef.current = { radius, flicker, darkness };
  });

  // One frame: draw the wash + glow from the current uniforms.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas || !live.canvas) return;
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
      u_flame: [x.get() * cssW, y.get() * cssH, p.radius],
      u_darkness: p.darkness,
      u_warmth: warmthRef.current,
      u_flicker: p.flicker,
      u_tick: tickRef.current,
      u_still: live.motionSafe ? 0 : 1,
    });
    tri.draw();
  }, [x, y]);

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
    // A paint may already be waiting: draw it now rather than on the next
    // tick or click.
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

  // Every motion-value change and every completed paint (a resize, most
  // often — this layer never reads the painted pixels) asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Warmth resolves against the host so a `var(--token)` picks up the theme
  // in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(warmth, host);
    warmthRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, warmth, requestFrame]);

  // The wick's own clock: a self-scheduling rAF that only exists to advance
  // u_tick and redraw every frame while the flame is on screen, the tab is
  // visible, and motion is safe — gated the same way as dust-reveal's idle
  // loop. Under reduced motion this effect never starts, leaving the single
  // still frame drawn above (steady, unflickering) in place.
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
        // Rebase the clock over the pause so the flicker resumes, not jumps.
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
  }, [surface.active, surface.motionSafe, surface.host, drawFrame]);

  // A click on the host moves the flame: the pointerdown position, as a
  // fraction of the host so it keeps its place across a resize, becomes the
  // new spring target. Reduced motion jumps straight there instead.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const down = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const fx = clamp01((event.clientX - rect.left) / Math.max(rect.width, 1));
      const fy = clamp01((event.clientY - rect.top) / Math.max(rect.height, 1));
      if (surfaceRef.current.motionSafe) {
        animate(x, fx, springs.snap);
        animate(y, fy, springs.snap);
      } else {
        x.set(fx);
        y.set(fy);
      }
    };

    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointerdown", down);
    };
  }, [surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="candle-glow"
      className="block h-full w-full"
    />
  );
}

/**
 * The live interface lit by one small flame: a warm point of light at
 * `position` inside a straight-alpha dark wash that thins on an exponential
 * falloff from the flame rather than a smoothstepped edge, so the light
 * pools instead of drawing a hard circle. Brightness rides two layered
 * noise terms seeded off the frame clock — a slow, wide sway and a quick,
 * small tremor — so the flame breathes without a single Math.random call,
 * and no flame glyph is ever drawn; the light alone marks where it sits.
 * Click the host and the flame springs to that point, held as a fraction of
 * the host so it keeps its place across a resize. The layer never samples
 * or bends the DOM beneath it — it only paints a vignette over the real
 * page.
 * Reduced motion: the light holds one steady, unflickering frame at its
 * current position and the clock never starts.
 */
export function CandleGlow({
  position = [0.5, 0.92],
  radius = 260,
  warmth = "#ffb56b",
  flicker = 1,
  darkness = 0.8,
  paint,
  className,
  children,
}: CandleGlowProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <FlameLayer
          position={position}
          radius={radius}
          warmth={warmth}
          flicker={flicker}
          darkness={darkness}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
