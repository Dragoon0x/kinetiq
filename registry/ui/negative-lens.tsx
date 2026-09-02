"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type NegativeLensProps = {
  /** Lens radius in CSS pixels. @default 160 */
  radius?: number;
  /** Feather width at the inner rim, as a fraction of the radius (0..1) — how far the radiograph fades out before the ring. @default 0.45 */
  softness?: number;
  /** Bone-white edge strength from the 3×3 Sobel over luminance. @default 0.8 */
  edge?: number;
  /** The blue-black cast the inverted image mixes toward. A literal CSS colour, not a design token. @default "#0b1a33" */
  cast?: string;
  /** Radiograph grain strength; animates only while the pointer is inside. @default 0.15 */
  grain?: number;
  /** A selector for elements the lens magnifies while the pointer is over them. */
  targets?: string;
  /** Magnification applied over a target. @default 1.3 */
  targetZoom?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_NOISE +
  GLSL_LUMA +
  /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_zoom;
uniform float u_edge;
uniform vec3 u_cast;
uniform float u_grain;
uniform float u_tick;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

// Fixed film character: how far the inversion drifts toward the cast, the
// bone tint added at edges, and the geometry of the rim and its shadow.
// None of these are exposed as props — the brief's tunables are radius,
// softness, edge strength, cast colour and grain, not the plate chemistry.
const vec3 BONE = vec3(0.95, 0.92, 0.84);
const float CAST_MIX = 0.4;
const float RING_WIDTH = 1.6;
const float SHADOW_SPAN = 10.0;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float t = clamp(r / R, 0.0, 1.0);
  float ring = 1.0 - smoothstep(0.0, RING_WIDTH, abs(r - R));

  if (u_still > 0.5) {
    // Reduced motion: a still ring at the pointer, no fill and no grain —
    // legible as a shape without moving or flickering anything under it.
    o_color = vec4(vec3(1.0), ring * 0.55 * u_opacity);
    return;
  }

  if (r > R + SHADOW_SPAN) { o_color = vec4(0.0); return; }

  vec3 rgb;
  float alpha;

  if (r <= R) {
    float zoom = max(u_zoom, 0.0001);
    vec2 centerUv = (u_lens.xy + d / zoom) / u_res;
    vec2 step = (1.5 / zoom) / u_res;

    vec3 page = sampleOver(centerUv);
    float tl = kx_luma(sampleOver(centerUv + vec2(-step.x, -step.y)));
    float tm = kx_luma(sampleOver(centerUv + vec2(0.0, -step.y)));
    float tr = kx_luma(sampleOver(centerUv + vec2(step.x, -step.y)));
    float ml = kx_luma(sampleOver(centerUv + vec2(-step.x, 0.0)));
    float mr = kx_luma(sampleOver(centerUv + vec2(step.x, 0.0)));
    float bl = kx_luma(sampleOver(centerUv + vec2(-step.x, step.y)));
    float bm = kx_luma(sampleOver(centerUv + vec2(0.0, step.y)));
    float br = kx_luma(sampleOver(centerUv + vec2(step.x, step.y)));
    float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
    float gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;
    float edgeMag = clamp(length(vec2(gx, gy)) * 1.5, 0.0, 1.0);

    vec3 inverted = 1.0 - page;
    vec3 xray = mix(inverted, u_cast, CAST_MIX);
    xray += BONE * edgeMag * u_edge;

    // Radiograph grain: a hashed flicker keyed on screen position and tick,
    // centred so it can darken as well as brighten. u_tick only advances
    // while the pointer is inside (see the layer's tick loop), so the grain
    // pattern holds static — never flickers — through the fade-out after
    // the pointer leaves, and is unreachable at all under u_still above.
    float grain = (kx_hash(px + u_tick) - 0.5) * 2.0 * u_grain;
    xray += vec3(grain);

    float soft = clamp(u_softness, 0.001, 1.0);
    float contentT = 1.0 - smoothstep(1.0 - soft, 1.0, t);
    rgb = clamp(xray, 0.0, 1.0);
    alpha = contentT * u_opacity;
  } else {
    float shadowT = (r - R) / SHADOW_SPAN;
    float shadowAlpha = (1.0 - smoothstep(0.0, 1.0, shadowT)) * 0.35;
    rgb = vec3(0.0);
    alpha = shadowAlpha * u_opacity;
  }

  rgb = mix(rgb, vec3(1.0), ring);
  alpha = max(alpha, ring * u_opacity);
  o_color = vec4(rgb, alpha);
}
`;

type LensLayerProps = Required<
  Pick<
    NegativeLensProps,
    "radius" | "softness" | "edge" | "cast" | "grain" | "targetZoom"
  >
> & { targets?: string };

/** Walks up from the host to the first opaque background colour, so page
 * samples over transparent texture regions composite onto the real page
 * rather than onto black. Mirrors crystal-lens's effectiveBackground. */
function effectiveBackground(
  el: HTMLElement | null,
): [number, number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg, node);
    if (rgba[3] > 0.01) return rgba;
    node = node.parentElement;
  }
  return resolveColor(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--background",
    ) || "#fff",
    document.documentElement,
  );
}

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, the grain clock, and the frame loop; reads everything else from
 * the surface.
 */
function LensLayer({
  radius,
  softness,
  edge,
  cast,
  grain,
  targets,
  targetZoom,
}: LensLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);
  const zoomLevel = useMotionValue<number>(1);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const castRgbRef = React.useRef<[number, number, number, number]>([
    0.04, 0.1, 0.2, 1,
  ]);
  const targetRectsRef = React.useRef<DOMRect[]>([]);
  const failedRef = React.useRef(false);
  const pointerInsideRef = React.useRef(false);
  const syncLoopRef = React.useRef<(() => void) | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, edge, grain });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, edge, grain };
  }, [radius, softness, edge, grain]);

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

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_zoom: zoomLevel.get(),
      u_edge: p.edge,
      u_cast: [
        castRgbRef.current[0],
        castRgbRef.current[1],
        castRgbRef.current[2],
      ],
      u_grain: p.grain,
      u_tick: tickRef.current,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, opacity, zoomLevel]);

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
    // pointer move.
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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, opacity, zoomLevel].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, zoomLevel, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the cast colour through the real cascade — it is a literal CSS
  // colour by default, but still scoped to the host in case a caller passes
  // a token through it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    castRgbRef.current = resolveColor(cast, host);
    requestFrame();
  }, [surface.host, cast, requestFrame]);

  // Pointer on the host: spring the lens, resolve targets, fade in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const refreshTargets = () => {
      if (!targets) {
        targetRectsRef.current = [];
        return;
      }
      const hostRect = host.getBoundingClientRect();
      targetRectsRef.current = [...host.querySelectorAll(targets)].map((el) => {
        const r = el.getBoundingClientRect();
        return new DOMRect(
          r.left - hostRect.left,
          r.top - hostRect.top,
          r.width,
          r.height,
        );
      });
    };
    refreshTargets();

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
      const over = targetRectsRef.current.some(
        (r) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom,
      );
      const wanted = over ? targetZoom : 1;
      if (Math.abs(zoomLevel.get() - wanted) > 0.001) {
        if (still) zoomLevel.set(wanted);
        else animate(zoomLevel, wanted, springs.glide);
      }
    };
    const enter = (event: PointerEvent) => {
      refreshTargets();
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      pointerInsideRef.current = true;
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
      syncLoopRef.current?.();
    };
    const leave = () => {
      pointerInsideRef.current = false;
      if (still) opacity.set(0);
      else animate(opacity, 0, { duration: 0.22 });
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
  }, [surface.host, targets, targetZoom, x, y, opacity, zoomLevel]);

  // The grain clock: ticks only while the pointer is inside, gated by
  // intersection and tab visibility, and off entirely under reduced motion
  // (u_still draws no grain, so there is nothing for it to feed). Kept on
  // `surface.active` for the same lifecycle reason as the GL effect above.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let loopRaf = 0;
    let lastTime: number | null = null;
    let inView = false;

    const shouldContinue = () =>
      surfaceRef.current.active &&
      surfaceRef.current.motionSafe &&
      inView &&
      !document.hidden &&
      pointerInsideRef.current;

    const loopStep = (now: number) => {
      loopRaf = 0;
      if (lastTime !== null) {
        tickRef.current += (now - lastTime) / 1000;
      }
      lastTime = now;
      drawFrame();
      if (shouldContinue()) {
        loopRaf = requestAnimationFrame(loopStep);
      } else {
        lastTime = null;
      }
    };
    const startLoop = () => {
      if (loopRaf !== 0) return;
      lastTime = null;
      loopRaf = requestAnimationFrame(loopStep);
    };
    const stopLoop = () => {
      if (loopRaf !== 0) cancelAnimationFrame(loopRaf);
      loopRaf = 0;
    };
    const syncLoop = () => {
      if (shouldContinue()) startLoop();
      else stopLoop();
    };
    syncLoopRef.current = syncLoop;

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncLoop();
    });
    intersection.observe(host);
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      syncLoopRef.current = null;
      stopLoop();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="negative-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * An x-ray lens that follows the cursor and reads the live interface as a
 * radiograph. Inside the circle every sample inverts (1 − colour) and drifts
 * toward a blue-black `cast`, a 3×3 Sobel over the painted texture's
 * luminance lifts bone-white edges on top, and a hashed grain flickers for as
 * long as the pointer stays inside — the clock that feeds it only runs while
 * hovering, so the plate never grains on its own. A thin white ring traces
 * the rim with a faint shadow just outside it. Hover a `targets` element and
 * the glass springs to `targetZoom` on `springs.glide`, the same contract
 * crystal-lens uses. The DOM underneath is real and untouched throughout.
 * Reduced motion: a still white ring holds at the pointer with no fill and
 * no grain, snapping straight to the cursor instead of springing to it.
 */
export function NegativeLens({
  radius = 160,
  softness = 0.45,
  edge = 0.8,
  cast = "#0b1a33",
  grain = 0.15,
  targets,
  targetZoom = 1.3,
  paint,
  className,
  children,
}: NegativeLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          edge={edge}
          cast={cast}
          grain={grain}
          targets={targets}
          targetZoom={targetZoom}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
