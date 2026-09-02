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

export type PulseBeatProps = {
  /** Beats per minute; the pulse period is `60 / bpm` seconds. @default 60 */
  bpm?: number;
  /** Pulse origin as [x, y] fractions of the host (0..1 each) — where each beat starts whenever the pointer is outside. @default [0.5, 0.5] */
  origin?: [number, number];
  /** Ring and warmth colour. @default "#ef4444" */
  color?: string;
  /** How far a beat's ring travels: its radius grows as `age * reach * 2`. @default 420 */
  reach?: number;
  /** Ring and warmth peak intensity (0..1). @default 0.55 */
  strength?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec2 u_origin;
uniform float u_ageCur;
uniform float u_agePrev;
uniform float u_reach;
uniform float u_strength;
uniform vec3 u_color;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

// One expanding ring's alpha at dist pixels from the origin, born age
// seconds ago: a narrow Gaussian band around its own growing radius, dying
// out with age. A ring not yet born (age less than zero) contributes nothing.
float ringBand(float dist, float age, float reach, float strength) {
  if (age < 0.0) return 0.0;
  float radius = age * reach * 2.0;
  float d = (dist - radius) / 26.0;
  return exp(-(d * d)) * exp(-age * 1.8) * strength;
}

void main() {
  if (u_still > 0.5) {
    // Reduced motion: nothing animates, nothing draws.
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  float dist = distance(px, u_origin);

  // Two rings per beat, the second born 0.1s after the first, for both the
  // current beat and the one before it — the previous beat's pair keeps
  // fading alongside the current beat's so the handoff at the boundary
  // never gaps.
  float band = 0.0;
  band = max(band, ringBand(dist, u_ageCur, u_reach, u_strength));
  band = max(band, ringBand(dist, u_ageCur - 0.1, u_reach, u_strength));
  band = max(band, ringBand(dist, u_agePrev, u_reach, u_strength));
  band = max(band, ringBand(dist, u_agePrev - 0.1, u_reach, u_strength));

  // A faint wash across the whole surface at the same instant the beat
  // lands, independent of distance from the origin.
  float warmth = 0.04 * exp(-max(u_ageCur, 0.0) * 6.0);

  o_color = vec4(u_color, clamp(band + warmth, 0.0, 1.0));
}
`;

type PulseBeatLayerProps = Required<
  Pick<PulseBeatProps, "bpm" | "origin" | "color" | "reach" | "strength">
>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The GL layer. Owns the context, the program, the origin spring, the beat
 * clock, and the frame loop; nothing here samples the painted texture — the
 * beat only conjures rings and a wash over the DOM, it never reads or bends
 * it.
 */
function PulseLayer({
  bpm,
  origin,
  color,
  reach,
  strength,
}: PulseBeatLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(origin[0]);
  const y = useMotionValue<number>(origin[1]);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const colorRef = React.useRef<[number, number, number]>([1, 0, 0]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ bpm, origin, reach, strength });
  React.useEffect(() => {
    paramsRef.current = { bpm, origin, reach, strength };
  });

  // One frame: the current and previous beat's ages decide the rings and
  // the wash — there is no other per-pixel state to track.
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

    const period = 60 / Math.max(p.bpm, 0.01);
    const curBeatTime = Math.floor(tickRef.current / period) * period;
    const ageCur = tickRef.current - curBeatTime;
    const agePrev = ageCur + period;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_origin: [x.get() * cssW, y.get() * cssH],
      u_ageCur: ageCur,
      u_agePrev: agePrev,
      u_reach: p.reach,
      u_strength: p.strength,
      u_color: colorRef.current,
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
    // A paint may already be waiting: draw it now rather than on the next
    // tick.
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

  // Colour resolves against the host so a `var(--token)` picks up the theme
  // in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // The beat's own clock: a self-scheduling rAF that only exists to advance
  // `tickRef` and redraw every frame while the panel is on screen, the tab
  // is visible, and motion is safe — gated exactly like dust-reveal's idle
  // loop. Under reduced motion this effect never starts, and the fragment
  // shader's `u_still` branch keeps every frame it does draw transparent.
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
        // Rebase the clock over the pause so the beat resumes, not jumps.
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

  // Pointer on the host: the origin springs to follow it on `springs.glide`
  // and eases back to `origin` on leave. Reduced motion sets the position
  // instantly instead of animating it — the drawn frame ignores it either
  // way, since `u_still` blanks the whole layer.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const moveTo = (fx: number, fy: number) => {
      if (surfaceRef.current.motionSafe) {
        animate(x, fx, springs.glide);
        animate(y, fy, springs.glide);
      } else {
        x.set(fx);
        y.set(fy);
      }
    };
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      moveTo(
        clamp01((event.clientX - rect.left) / Math.max(rect.width, 1)),
        clamp01((event.clientY - rect.top) / Math.max(rect.height, 1)),
      );
    };
    const leave = () => {
      const [ox, oy] = paramsRef.current.origin;
      moveTo(ox, oy);
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
  }, [surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="pulse-beat"
      className="block h-full w-full"
    />
  );
}

/**
 * A pulse the interface keeps time to: once every `60 / bpm` seconds a ring
 * leaves `origin` and travels outward as a narrow, fading band, with a
 * second ring 0.1s behind the first so each beat reads as a double knock
 * rather than one plain circle. The previous beat's pair keeps rendering
 * alongside the current beat's, by then faded nearly to nothing, so the
 * handoff at every beat boundary never gaps. A softer wash breathes across
 * the whole surface at the same instant the beat lands. Move the pointer
 * over the interface and the origin springs to follow it; move it away and
 * the origin eases back to `origin`. The layer never samples or bends the
 * DOM beneath it — the beat is a light show riding over the real interface.
 * Reduced motion: the beat never starts and the layer draws nothing.
 */
export function PulseBeat({
  bpm = 60,
  origin = [0.5, 0.5],
  color = "#ef4444",
  reach = 420,
  strength = 0.55,
  paint,
  className,
  children,
}: PulseBeatProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <PulseLayer
          bpm={bpm}
          origin={origin}
          color={color}
          reach={reach}
          strength={strength}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
