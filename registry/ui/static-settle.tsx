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

export type StaticSettleProps = {
  /** Grey-noise mix strength (0..1) — how much of the frame the static
   * replaces versus letting the shaded page show through. @default 0.35 */
  grain?: number;
  /** Rolling-band brightness amplitude. @default 1 */
  bands?: number;
  /** Rolling-band scroll speed. @default 3 */
  speed?: number;
  /** Clear-circle radius once the pointer has settled, in CSS pixels. @default 200 */
  radius?: number;
  /** Seconds the pointer must hold under 2px of frame-to-frame drift before the circle opens. @default 0.6 */
  settle?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_NOISE +
  /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_grain;
uniform float u_bands;
uniform float u_speed;
uniform float u_radius;
uniform vec2 u_center;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 page = sampleOver(v_uv);

  // Rolling bands: a slow brightness wave climbing the frame.
  float band = 1.0 + sin(px.y * 0.05 - u_tick * u_speed) * u_bands * 0.15;
  vec3 shaded = page * band;

  // Grey noise, reseeded ~30 times a second from the pixel and the frame
  // index -- never a random() call, so the same tick always hashes the same.
  float frame = floor(u_tick * 30.0);
  float noiseVal = kx_hash(px + frame * 7.0);
  vec3 noisy = mix(shaded, vec3(noiseVal), clamp(u_grain, 0.0, 1.0));

  // Clear circle, feathered 30px, centred on the pointer's rest position.
  // step() keeps a near-zero radius from leaving a one-pixel clear dot at
  // its own centre.
  float R = max(u_radius, 0.0);
  float dist = length(px - u_center);
  float inner = max(R - 30.0, 0.0);
  float outer = max(R, inner + 0.001);
  float clear = (1.0 - smoothstep(inner, outer, dist)) * step(0.5, R);

  o_color = vec4(mix(noisy, page, clear), 1.0);
}
`;

type StaticSettleLayerProps = Required<
  Pick<StaticSettleProps, "grain" | "bands" | "speed" | "radius" | "settle">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, same as
 * tape-wear, unless `override` is given -- `within` scopes any var() token
 * in `override` (or a walked-up token) to the host's own theme. */
function effectiveBackground(
  el: HTMLElement | null,
  override?: string,
): [number, number, number, number] {
  if (override) return resolveColor(override, el);
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

// Frame-to-frame drift under this many CSS px counts as "resting".
const REST_VELOCITY_PX = 2;

/**
 * The GL layer. Owns the context, the program, the texture, the tick clock,
 * the pointer/rest bookkeeping, the radius spring, and the frame loop; reads
 * everything else from the surface.
 */
function StaticSettleLayer({
  grain,
  bands,
  speed,
  radius,
  settle,
  background,
}: StaticSettleLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const radiusMv = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  // Pointer + rest bookkeeping lives in refs, never React state -- the tick
  // loop below reads and advances it once per frame.
  const pointerRef = React.useRef({ x: 0, y: 0, inside: false });
  const lastSampleRef = React.useRef({ x: 0, y: 0 });
  const centerRef = React.useRef({ x: 0, y: 0 });
  const restElapsedRef = React.useRef(0);
  const targetRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ grain, bands, speed, radius, settle });
  React.useEffect(() => {
    paramsRef.current = { grain, bands, speed, radius, settle };
  });

  // One frame: upload the texture if a new paint landed, then draw every
  // uniform from the refs and the radius spring above (never from React
  // state).
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
      u_grain: p.grain,
      u_bands: p.bands,
      u_speed: p.speed,
      u_radius: radiusMv.get(),
      u_center: [centerRef.current.x, centerRef.current.y],
      u_bg: bg,
    });
    tri.draw();
  }, [radiusMv]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // replace mode), so this is keyed on `surface.active`, not on mount -- a
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

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour whenever the host or the override changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host, background);
  }, [surface.host, background]);

  // The pointer, recorded only -- the rest timer and the spring decision
  // both live in the tick loop below, which is the only thing that reads
  // these refs.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = event.clientX - rect.left;
      pointerRef.current.y = event.clientY - rect.top;
      pointerRef.current.inside = true;
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      pointerRef.current.x = px;
      pointerRef.current.y = py;
      pointerRef.current.inside = true;
      // Sync the last sample so the very first tick after entry doesn't
      // read a stale jump as motion.
      lastSampleRef.current.x = px;
      lastSampleRef.current.y = py;
      restElapsedRef.current = 0;
    };
    const leave = () => {
      pointerRef.current.inside = false;
      restElapsedRef.current = 0;
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
  }, [surface.host]);

  // The continuous loop: the static never stops on its own, so `u_tick`
  // advances every frame the host is actually visible -- gated by
  // IntersectionObserver and page visibility, only while `surface.active`
  // (dust-reveal's idle-loop shape, run unconditionally rather than gated
  // on a drift prop). Each tick also advances the rest timer from the
  // pointer positions `pointermove` recorded above, and springs the clear
  // radius open once the pointer has held still for `settle` seconds --
  // and shut again the moment it moves or leaves.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let started: number | null = null;
    let lastTime: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
      lastTime = now;

      const pointer = pointerRef.current;
      if (pointer.inside) {
        const dx = pointer.x - lastSampleRef.current.x;
        const dy = pointer.y - lastSampleRef.current.y;
        const drifted = Math.hypot(dx, dy);
        lastSampleRef.current.x = pointer.x;
        lastSampleRef.current.y = pointer.y;
        restElapsedRef.current =
          drifted < REST_VELOCITY_PX ? restElapsedRef.current + dt : 0;
        centerRef.current.x = pointer.x;
        centerRef.current.y = pointer.y;
      } else {
        restElapsedRef.current = 0;
      }

      const settled =
        pointer.inside && restElapsedRef.current >= paramsRef.current.settle;
      const desired = settled ? paramsRef.current.radius : 0;
      if (desired !== targetRef.current) {
        targetRef.current = desired;
        animate(radiusMv, desired, springs.drift);
      }

      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so playback resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        lastTime = null;
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
  }, [surface.active, surface.host, drawFrame, radiusMv]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="static-settle"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface under a television's worth of static: a grey-noise field
 * reseeds itself about thirty times a second from the pixel and the frame
 * index, and a slow brightness wave rolls down the frame beneath it, both
 * driven off one continuous clock rather than a random call, so the static
 * never stops while the pane is on screen. Hold the pointer still -- under
 * two pixels of frame-to-frame drift -- for `settle` seconds and a circle
 * opens where it rested, feathered 30px, showing the real interface clean
 * and sharp; nudge the pointer or leave, and the circle springs shut. Only
 * the radius is a spring: its centre just follows the last place the
 * pointer held.
 * Reduced motion: `SurfacePaint`'s replace-mode contract shows the real DOM
 * and this layer renders nothing.
 */
export function StaticSettle({
  grain = 0.35,
  bands = 1,
  speed = 3,
  radius = 200,
  settle = 0.6,
  background,
  paint,
  className,
  children,
}: StaticSettleProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <StaticSettleLayer
          grain={grain}
          bands={bands}
          speed={speed}
          radius={radius}
          settle={settle}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
