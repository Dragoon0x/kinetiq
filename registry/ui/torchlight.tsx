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
import { easings, springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type TorchlightProps = {
  /** Beam radius in CSS pixels. @default 190 */
  radius?: number;
  /** Fraction of the radius spent easing the beam's edge (0..~0.95). @default 0.55 */
  softness?: number;
  /** Overlay darkness outside the beam (0..1). @default 0.85 */
  darkness?: number;
  /** Warm tint painted inside the beam, any CSS colour. @default "#ffd9a3" */
  warmth?: string;
  /** Flicker strength while the pointer holds inside the beam. @default 1 */
  flicker?: number;
  /** Resting beam level once the pointer leaves and the torch settles (0..1). @default 0.35 */
  idle?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** Seconds the beam takes to ease from full brightness back down to `idle` once the pointer leaves. */
const SETTLE_S = 3.5;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec3 u_torch;
uniform float u_softness;
uniform float u_darkness;
uniform vec3 u_warmth;
uniform float u_flicker;
uniform float u_idle;
uniform float u_mix;
uniform float u_tick;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

void main() {
  vec2 px = v_uv * u_res;
  float dist = length(px - u_torch.xy);
  float R = max(u_torch.z, 1.0);
  // The disc's inner edge sits a softness-share of R back from the rim, so
  // the same smoothstep both shapes the beam's falloff and stays clear of
  // the e0 == e1 case a softness of exactly 0 would otherwise hit.
  float inner = R * (1.0 - clamp(u_softness, 0.02, 0.95));

  float flickerScale = 1.0;
  if (u_still < 0.5) {
    // Reseeds every frame from the flicker clock alone, so the tremor is
    // seeded and repeatable, never Math.random on the JS side.
    flickerScale = 1.0 + (kx_noise(vec2(u_tick * 9.0, 0.0)) - 0.5) * 0.06 * u_flicker;
  }
  float localBeam = clamp(1.0 - smoothstep(inner, R, dist) * flickerScale, 0.0, 1.0);
  // u_mix blends between a spatial spotlight at the pointer (1) and a flat
  // idle wash with no position dependence at all (0) — the same uniform
  // that eases from 1 to 0 as the torch settles after the pointer leaves.
  float beam = mix(clamp(u_idle, 0.0, 1.0), localBeam, clamp(u_mix, 0.0, 1.0));

  // Two conceptual layers composited into one straight-alpha fragment: a
  // black wash at darkAlpha, then a warm tint at warmAlpha painted over it.
  float darkAlpha = clamp(u_darkness, 0.0, 1.0) * (1.0 - beam);
  float warmAlpha = 0.1 * beam;
  float outAlpha = warmAlpha + darkAlpha * (1.0 - warmAlpha);
  vec3 outColor = outAlpha > 0.0001 ? (u_warmth * warmAlpha) / outAlpha : vec3(0.0);
  o_color = vec4(outColor, outAlpha);
}
`;

type TorchLayerProps = Required<
  Pick<
    TorchlightProps,
    "radius" | "softness" | "darkness" | "warmth" | "flicker" | "idle"
  >
>;

/**
 * The GL layer. Owns the context, the program, the pointer spring, the
 * flicker clock, and the frame loop; nothing here ever samples the painted
 * texture — the torch only conjures a vignette over the DOM, it never reads
 * or bends it.
 */
function TorchLayer({
  radius,
  softness,
  darkness,
  warmth,
  flicker,
  idle,
}: TorchLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  // 0 = flat idle wash, 1 = full spotlight at the pointer.
  const mix = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const warmthRef = React.useRef<[number, number, number]>([1, 0.85, 0.64]);
  const failedRef = React.useRef(false);

  const tickRef = React.useRef(0);
  const hoveringRef = React.useRef(false);
  const syncLoopRef = React.useRef<() => void>(() => {});

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, darkness, flicker, idle });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, darkness, flicker, idle };
  });

  // One frame: draw the vignette + beam from the current uniforms.
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
      u_torch: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_darkness: p.darkness,
      u_warmth: warmthRef.current,
      u_flicker: p.flicker,
      u_idle: p.idle,
      u_mix: mix.get(),
      u_tick: tickRef.current,
      u_still: live.motionSafe ? 0 : 1,
    });
    tri.draw();
  }, [x, y, mix]);

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
    // A paint may already be waiting: draw the idle wash now rather than on
    // the first pointer move.
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
    const unsubs = [x, y, mix].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, mix, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The flicker clock: a self-scheduling rAF that only exists to advance
  // u_tick and redraw every frame while the pointer sits inside the beam
  // and motion is safe. It starts on pointerenter and stops on
  // pointerleave — the settle tween that follows keeps drawing through the
  // motion-value subscription above, unrelated to this loop.
  React.useEffect(() => {
    if (!surface.active) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun =
        hoveringRef.current &&
        !document.hidden &&
        surfaceRef.current.motionSafe;
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
    syncLoopRef.current = syncLoop;
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      syncLoopRef.current = () => {};
    };
  }, [surface.active, drawFrame]);

  // Pointer on the host: spring the torch to the cursor, blend the beam in
  // on entry, ease it back to idle on exit, and start/stop the flicker loop.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(warmth, host);
    warmthRef.current = [rgba[0], rgba[1], rgba[2]];

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      hoveringRef.current = true;
      syncLoopRef.current();
      if (still) {
        x.set(px);
        y.set(py);
        mix.set(1);
      } else {
        x.jump(px);
        y.jump(py);
        animate(mix, 1, springs.snap);
      }
    };
    const leave = () => {
      hoveringRef.current = false;
      syncLoopRef.current();
      if (still) mix.set(0);
      else animate(mix, 0, { duration: SETTLE_S, ease: easings.exit });
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, warmth, x, y, mix]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="torchlight"
      className="block h-full w-full"
    />
  );
}

/**
 * The live interface in the dark, lit only by a torch that follows the
 * cursor. Outside the beam a black wash sits at `darkness × (1 - beam)`
 * alpha; inside it, a `warmth` tint bleeds through at a tenth of the
 * beam's own strength — one smoothstepped falloff from the pointer drives
 * both. A small noise term reseeds every frame while the pointer holds
 * inside the beam, so its edge trembles like a real flame instead of
 * holding a hard circle. The effect never samples or bends the DOM
 * underneath — it only paints a vignette over it. Step away and the beam
 * eases back to a low `idle` level over about three and a half seconds, so
 * the page dims rather than snapping to black.
 * Reduced motion: the torch still follows the pointer, but it jumps
 * instead of springing, holds a fixed edge with no flicker, and drops to
 * `idle` the instant the pointer leaves instead of settling.
 */
export function Torchlight({
  radius = 190,
  softness = 0.55,
  darkness = 0.85,
  warmth = "#ffd9a3",
  flicker = 1,
  idle = 0.35,
  paint,
  className,
  children,
}: TorchlightProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <TorchLayer
          radius={radius}
          softness={softness}
          darkness={darkness}
          warmth={warmth}
          flicker={flicker}
          idle={idle}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
