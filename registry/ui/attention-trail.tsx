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
import type { PaintOptions } from "@/registry/lib/paint";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

const PALETTES: Record<
  "warm" | "cool" | "mono",
  { first: [number, number, number]; second: [number, number, number] }
> = {
  // Amber #f59e0b -> red #ef4444.
  warm: { first: [0.9608, 0.6196, 0.0431], second: [0.9373, 0.2667, 0.2667] },
  // Sky #38bdf8 -> indigo #6366f1.
  cool: { first: [0.2196, 0.7412, 0.9725], second: [0.3882, 0.4, 0.9451] },
  // Grey #94a3b8 -> ink #334155.
  mono: { first: [0.5804, 0.6392, 0.7216], second: [0.2, 0.2549, 0.3333] },
};

export type AttentionTrailPalette = keyof typeof PALETTES;

export type AttentionTrailProps = {
  /** Heat-stamp radius, in CSS pixels. @default 90 */
  radius?: number;
  /** How strongly each stamp warms the map (its paint alpha is `warm * 0.15`). @default 0.6 */
  warm?: number;
  /** How much the map fades back toward cold on every active frame. @default 0.02 */
  cool?: number;
  /** Colour ramp the heat is read through. @default "warm" */
  palette?: AttentionTrailPalette;
  /** Overlay alpha ceiling at full heat (0..1). @default 0.5 */
  max?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_map;
uniform vec2 u_mapRes;
uniform vec3 u_first;
uniform vec3 u_second;
uniform float u_max;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

void main() {
  if (u_still > 0.5) {
    // Reduced motion: the map is never warmed, so there is nothing to
    // show but one still, empty frame.
    o_color = vec4(0.0);
    return;
  }

  // A 5-tap cross blur of the heat map's red channel, at the map's own
  // texel spacing, so the low-resolution stamps read as a soft field
  // rather than a blocky one.
  vec2 texel = 1.0 / max(u_mapRes, vec2(1.0));
  float h = texture(u_map, v_uv).r * 0.4
    + texture(u_map, v_uv + vec2(texel.x, 0.0)).r * 0.15
    + texture(u_map, v_uv - vec2(texel.x, 0.0)).r * 0.15
    + texture(u_map, v_uv + vec2(0.0, texel.y)).r * 0.15
    + texture(u_map, v_uv - vec2(0.0, texel.y)).r * 0.15;

  vec3 color = mix(u_first, u_second, smoothstep(0.3, 1.0, h));
  float alpha = smoothstep(0.02, 0.6, h) * u_max;
  o_color = vec4(color, alpha);
}
`;

type AttentionLayerProps = Required<
  Pick<AttentionTrailProps, "radius" | "warm" | "cool" | "palette" | "max">
>;

/**
 * The GL layer. Owns the context, the program, the offscreen heat map and
 * its texture, the pointer state, and the self-stopping frame loop; reads
 * everything else from the surface.
 */
function AttentionTrailLayer({
  radius,
  warm,
  cool,
  palette,
  max,
}: AttentionLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const heatTextureRef = React.useRef<WebGLTexture | null>(null);
  const heatCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const heatCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  // Pointer state lives in refs, never React state — read once per frame.
  const pointerRef = React.useRef({ x: 0, y: 0 });
  const pointerInsideRef = React.useRef(false);
  // A CPU estimate of the map's own total warmth: bumped by every stamp,
  // decayed by `cool` every active frame. It is what decides whether the
  // loop keeps running once the pointer has left.
  const heatRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, warm, cool, palette, max });
  React.useEffect(() => {
    paramsRef.current = { radius, warm, cool, palette, max };
  });

  // One frame: re-upload the heat map if it exists, then draw. With no map
  // yet (nothing has warmed, or reduced motion never let it warm) the
  // canvas is simply cleared, which is exactly "draw nothing".
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas) return;
    if (gl.isContextLost()) return;

    resizeGL(gl, canvas, { dprCap: 2 });
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const map = heatCanvasRef.current;
    if (map) {
      heatTextureRef.current = uploadTexture(
        gl,
        map,
        { linear: true, premultiply: true },
        heatTextureRef.current,
      );
    }
    const texture = heatTextureRef.current;
    if (!map || !texture) return;

    const p = paramsRef.current;
    const ramp = PALETTES[p.palette];
    program.use();
    program.texture("u_map", texture, 0);
    program.set({
      u_mapRes: [map.width, map.height],
      u_first: ramp.first,
      u_second: ramp.second,
      u_max: p.max,
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
    // Heat may already be sitting in the map from before this canvas
    // mounted: draw it now rather than waiting on the next pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (heatTextureRef.current) gl.deleteTexture(heatTextureRef.current);
      heatTextureRef.current = null;
      heatCanvasRef.current = null;
      heatCtxRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Pointer + the heat loop, together: the loop only exists to warm and
  // fade the map, so it is driven by the same pointer state that feeds it.
  // It runs while the pointer rests inside OR the map still carries heat
  // from a recent visit, gated by the surface being active, the host being
  // on screen, and the tab being visible — and it stops on its own once
  // everything has cooled. Under reduced motion the effect does not even
  // attach: the map is never warmed and nothing ever loops.
  React.useEffect(() => {
    if (!surface.active) return;
    if (!surface.motionSafe) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let inView = false;

    const shouldRun = () => pointerInsideRef.current || heatRef.current >= 0.01;

    // The map tracks the canvas at quarter resolution, resized (which
    // clears it) whenever the host's own size changes.
    const ensureMap = (
      cssW: number,
      cssH: number,
    ): { ctx: CanvasRenderingContext2D | null; mapW: number; mapH: number } => {
      const mapW = Math.max(1, Math.round(cssW * 0.25));
      const mapH = Math.max(1, Math.round(cssH * 0.25));
      let map = heatCanvasRef.current;
      if (!map) {
        map = document.createElement("canvas");
        heatCanvasRef.current = map;
        heatCtxRef.current = map.getContext("2d");
      }
      if (map.width !== mapW || map.height !== mapH) {
        map.width = mapW;
        map.height = mapH;
      }
      return { ctx: heatCtxRef.current, mapW, mapH };
    };

    // A radial gradient disc, painted "lighter" so overlapping stamps pile
    // up rather than replace each other.
    const stampHeat = (cssW: number, cssH: number) => {
      const { ctx, mapW, mapH } = ensureMap(cssW, cssH);
      if (!ctx || cssW <= 0 || cssH <= 0) return;
      const scaleX = mapW / cssW;
      const scaleY = mapH / cssH;
      const mx = pointerRef.current.x * scaleX;
      const my = pointerRef.current.y * scaleY;
      const mr = Math.max(1, paramsRef.current.radius * scaleX);
      const gradient = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
      gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      const alpha = clamp(paramsRef.current.warm * 0.15, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Unbounded on purpose: a long hover piles up more estimated warmth
      // than a quick pass, so the tail the loop chases afterward is longer
      // too — the linear decay below is what turns that into ~8s at the
      // house defaults.
      heatRef.current += alpha;
    };

    // A flat destination-out fill, fading the whole map back toward cold.
    const fadeHeat = (cssW: number, cssH: number) => {
      const { ctx, mapW, mapH } = ensureMap(cssW, cssH);
      if (!ctx) return;
      const alpha = clamp(paramsRef.current.cool, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, mapW, mapH);
      ctx.restore();
      heatRef.current = Math.max(0, heatRef.current - alpha);
    };

    const tick = () => {
      raf = 0;
      const rect = host.getBoundingClientRect();
      fadeHeat(rect.width, rect.height);
      if (pointerInsideRef.current) stampHeat(rect.width, rect.height);
      drawFrame();
      if (inView && !document.hidden && shouldRun()) {
        raf = requestAnimationFrame(tick);
      }
    };

    const ensureRunning = () => {
      if (raf !== 0 || !inView || document.hidden) return;
      if (!shouldRun()) return;
      raf = requestAnimationFrame(tick);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = event.clientX - rect.left;
      pointerRef.current.y = event.clientY - rect.top;
      pointerInsideRef.current = true;
      // Spawn heat right here too, not only from the loop — a fast sweep
      // should never outrun the map.
      stampHeat(rect.width, rect.height);
      requestFrame();
      ensureRunning();
    };
    const leave = () => {
      pointerInsideRef.current = false;
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      if (inView) {
        ensureRunning();
      } else if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    intersection.observe(host);

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== 0) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      } else {
        ensureRunning();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
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
      data-effect-canvas="attention-trail"
      className="block h-full w-full"
    />
  );
}

/**
 * A heat map of where the pointer has rested, laid back over the live
 * interface. The device is small and honest: a quarter-resolution offscreen
 * 2D canvas — never the page itself — is stamped with a soft radial disc on
 * every pointer move and on every active frame, and fades back toward cold
 * at a steady rate, so what the shader reads is a real, decaying record of
 * dwell rather than a live effect on the DOM underneath. That map's red
 * channel is blurred across five taps and run through a two-colour ramp;
 * everywhere it holds no heat, the layer draws nothing. The loop that warms
 * and fades the map runs only while the pointer rests inside the surface or
 * the map still carries warmth from a recent visit, and stops on its own
 * once everything has cooled.
 * Reduced motion: the map is never warmed and the layer renders nothing, so
 * the interface underneath shows exactly as it does without the effect.
 */
export function AttentionTrail({
  radius = 90,
  warm = 0.6,
  cool = 0.02,
  palette = "warm",
  max = 0.5,
  paint,
  className,
  children,
}: AttentionTrailProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <AttentionTrailLayer
          radius={radius}
          warm={warm}
          cool={cool}
          palette={palette}
          max={max}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
