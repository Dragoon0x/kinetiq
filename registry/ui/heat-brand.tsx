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
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type HeatBrandProps = {
  /** How fast the brush grows and darkens, as a fraction of `radius` per second. @default 0.9 */
  rate?: number;
  /** Maximum brush radius, in CSS pixels. @default 110 */
  radius?: number;
  /** Multiplier on how dark a fully scorched spot reads. @default 1 */
  char?: number;
  /** Multiplier on the ember ring's glow at the scorch front. @default 1 */
  glow?: number;
  /** Ember ring colour; its own core always runs hot white. CSS, resolved with `resolveColor`. @default "#ff7a1a" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_map;
uniform float u_char;
uniform float u_glow;
uniform vec3 u_color;
uniform float u_ember;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

const vec3 SCORCH_TAN = vec3(0.784314, 0.643137, 0.415686);
const vec3 SCORCH_BROWN = vec3(0.419608, 0.239216, 0.101961);
const vec3 SCORCH_BLACK = vec3(0.0);
// The colour ramp treats 0.3 as freshly scorched paper; the ember ring
// below reads the same threshold as the burn's leading edge.
const float FRONT = 0.3;

vec3 scorchColor(float s) {
  if (s < 0.6) {
    return mix(SCORCH_TAN, SCORCH_BROWN, smoothstep(0.25, 0.6, s));
  }
  return mix(SCORCH_BROWN, SCORCH_BLACK, smoothstep(0.6, 1.0, s));
}

void main() {
  if (u_still > 0.5) {
    // Reduced motion: nothing draws and holding does nothing — there is
    // no still frame worth freezing on a mark that only exists mid-burn.
    o_color = vec4(0.0);
    return;
  }

  float s = texture(u_map, v_uv).r;
  vec3 charColor = scorchColor(s);
  float charAlpha = clamp(smoothstep(0.02, 0.3, s) * u_char, 0.0, 1.0);

  // Ember ring: a narrow band straddling the scorch front, hottest (white)
  // right at the threshold and cooling to u_color toward its own edges.
  float distFromFront = abs(s - FRONT);
  float ringOuter = 1.0 - smoothstep(0.0, 0.07, distFromFront);
  float ringCore = 1.0 - smoothstep(0.0, 0.02, distFromFront);
  vec3 ringColor = mix(u_color, vec3(1.0), ringCore);
  float ringAlpha = clamp(ringOuter * u_glow * u_ember, 0.0, 1.0);

  // Composite the ring over the char mark (both non-premultiplied) so a
  // single alpha-blended pass over the live page reads correctly.
  float outAlpha = ringAlpha + charAlpha * (1.0 - ringAlpha);
  vec3 outColor = outAlpha > 0.0001
    ? (ringColor * ringAlpha + charColor * charAlpha * (1.0 - ringAlpha)) / outAlpha
    : vec3(0.0);

  o_color = vec4(outColor, outAlpha);
}
`;

/** Milliseconds the ember ring keeps glowing after release before it goes dark. */
const EMBER_FADE_MS = 600;

/** 1 while held; otherwise the ember's remaining strength as it cools over `EMBER_FADE_MS`. */
function emberStrength(
  now: number,
  held: boolean,
  releasedAt: number | null,
): number {
  if (held) return 1;
  if (releasedAt === null) return 0;
  return clamp(1 - (now - releasedAt) / EMBER_FADE_MS, 0, 1);
}

/** Grows a brush radius toward `maxRadius` at `rate` (a fraction of `maxRadius`) per second. */
function growBrush(
  current: number,
  maxRadius: number,
  rate: number,
  dt: number,
): number {
  return clamp(current + rate * maxRadius * dt, 0, maxRadius);
}

/** Paints one soft radial stroke into the scorch map with "lighter" compositing, so repeated strokes over the same spot build toward opaque rather than replace one another. */
function paintScorch(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  radiusPx: number,
  alpha: number,
): void {
  if (radiusPx <= 0 || alpha <= 0) return;
  const gradient = ctx.createRadialGradient(mx, my, 0, mx, my, radiusPx);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = alpha;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(mx, my, radiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

type HeatBrandLayerProps = Required<
  Pick<HeatBrandProps, "rate" | "radius" | "char" | "glow" | "color">
>;

/**
 * The GL layer. Owns the context, the program, the scorch map and its
 * texture, the pointer/hold state, and the frame loop; reads everything
 * else from the surface.
 */
function HeatBrandLayer({
  rate,
  radius,
  char,
  glow,
  color,
}: HeatBrandLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const mapCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mapCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const mapTextureRef = React.useRef<WebGLTexture | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const colorRef = React.useRef<[number, number, number]>([1, 0.478, 0.102]);
  const failedRef = React.useRef(false);

  // Pointer + hold state lives in refs, never React state — read once per
  // frame, never in render.
  const pointerRef = React.useRef({ x: 0, y: 0 });
  const heldRef = React.useRef(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const brushRadiusRef = React.useRef(0);
  // rAF-timestamp domain (same clock as `now` below and `performance.now()`).
  const releaseTimeRef = React.useRef<number | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ rate, radius, char, glow });
  React.useEffect(() => {
    paramsRef.current = { rate, radius, char, glow };
  });

  // One frame: grow and warm the scorch map when `warm` is set and the
  // pointer is currently held (a plain requestFrame() redraw leaves the map
  // untouched), re-upload it on any change, then draw.
  const drawFrame = React.useCallback((now: number, warm = false, dt = 0) => {
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

    // The scorch map tracks the GL canvas at quarter resolution,
    // recreated (which clears it) whenever the host resizes — the only
    // way a mark ever goes away, since the effect itself never fades one.
    const mapW = Math.max(1, Math.round(size.width * 0.25));
    const mapH = Math.max(1, Math.round(size.height * 0.25));
    let map = mapCanvasRef.current;
    let resized = false;
    if (!map) {
      map = document.createElement("canvas");
      mapCanvasRef.current = map;
      mapCtxRef.current = map.getContext("2d");
      resized = true;
    }
    if (map.width !== mapW || map.height !== mapH) {
      map.width = mapW;
      map.height = mapH;
      resized = true;
      brushRadiusRef.current = 0;
    }
    const mctx = mapCtxRef.current;

    let painted = false;
    if (warm && mctx && dt > 0 && heldRef.current) {
      const scaleX = cssW > 0 ? map.width / cssW : 0;
      const scaleY = cssH > 0 ? map.height / cssH : 0;
      const mx = pointerRef.current.x * scaleX;
      const my = pointerRef.current.y * scaleY;
      brushRadiusRef.current = growBrush(
        brushRadiusRef.current,
        p.radius,
        p.rate,
        dt,
      );
      const mr = Math.max(1, brushRadiusRef.current * scaleX);
      paintScorch(mctx, mx, my, mr, clamp(p.rate * dt, 0, 1));
      painted = true;
    }

    if (mctx && (resized || painted || !mapTextureRef.current)) {
      // Premultiplied so the accumulated alpha (built up by "lighter")
      // lands directly in the red channel the shader reads — a plain
      // unmultiplied upload would leave red pinned at 1 wherever the map
      // has ever been touched, losing the buildup entirely. Mirrors
      // ice-pane's melt map.
      mapTextureRef.current = uploadTexture(
        gl,
        map,
        { linear: true, premultiply: true },
        mapTextureRef.current,
      );
    }
    const mapTexture = mapTextureRef.current;
    if (!mapTexture) return;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_map", mapTexture, 0);
    program.set({
      u_char: p.char,
      u_glow: p.glow,
      u_color: colorRef.current,
      u_ember: emberStrength(now, heldRef.current, releaseTimeRef.current),
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
    // A paint may already be waiting: draw it now rather than on the next
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (mapTextureRef.current) gl.deleteTexture(mapTextureRef.current);
      mapTextureRef.current = null;
      mapCanvasRef.current = null;
      mapCtxRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame, even while nothing is held.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer + the hold loop, together: the loop only exists to grow and
  // warm the scorch map and to cool the ember ring, so it is driven by the
  // same pointer state that feeds it. It runs while the pointer is held
  // (captured, so a drag outside the panel still counts) or the ember still
  // has strength left, and stops itself once both are spent.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRef.current = [rgba[0], rgba[1], rgba[2]];

    let raf: number | null = null;
    let lastTime: number | null = null;

    const tick = (now: number) => {
      raf = null;
      const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
      lastTime = now;
      drawFrame(now, true, dt);
      if (emberStrength(now, heldRef.current, releaseTimeRef.current) > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        lastTime = null;
        releaseTimeRef.current = null;
      }
    };

    const ensureRunning = () => {
      if (raf !== null) return;
      lastTime = null;
      raf = requestAnimationFrame(tick);
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!surfaceRef.current.motionSafe) return; // reduced motion: holding does nothing
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = event.clientX - rect.left;
      pointerRef.current.y = event.clientY - rect.top;
      heldRef.current = true;
      pointerIdRef.current = event.pointerId;
      brushRadiusRef.current = 0;
      ensureRunning();
    };
    const move = (event: PointerEvent) => {
      if (!heldRef.current || event.pointerId !== pointerIdRef.current) return;
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = event.clientX - rect.left;
      pointerRef.current.y = event.clientY - rect.top;
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return;
      heldRef.current = false;
      pointerIdRef.current = null;
      releaseTimeRef.current = performance.now();
      ensureRunning();
    };

    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("pointerleave", up);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("pointerleave", up);
    };
  }, [surface.active, surface.host, color, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="heat-brand"
      className="block h-full w-full"
    />
  );
}

/**
 * A brand that only shows while you press. Holding the pointer down warms a
 * small offscreen map at the pointer — quarter the surface's resolution,
 * the same technique as ice-pane's melt map, but without a fade: what warms
 * stays warmed, its brush growing from nothing up to `radius` at `rate` and
 * darkening wherever it lingers. The shader reads that map to ramp scorched
 * paper from tan through brown to black, `char` scaling how dark it reads,
 * and draws a hot ember ring at the burn's leading edge — a white core
 * cooling to `color` — that keeps glowing for a moment after you let go
 * before it fades. A mark only disappears when the surface repaints at a
 * new size.
 * Reduced motion: nothing draws and holding does nothing — there is no
 * still frame worth freezing on a mark that only exists mid-burn.
 */
export function HeatBrand({
  rate = 0.9,
  radius = 110,
  char = 1,
  glow = 1,
  color = "#ff7a1a",
  paint,
  className,
  children,
}: HeatBrandProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <HeatBrandLayer
          rate={rate}
          radius={radius}
          char={char}
          glow={glow}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
