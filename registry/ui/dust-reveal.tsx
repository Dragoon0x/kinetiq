"use client";

import * as React from "react";

import { animate, useMotionValue, type Transition } from "motion/react";

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

export type DustRevealProps = {
  /** Reveal radius in CSS pixels — how close the cursor must get before dust starts coalescing. @default 380 */
  radius?: number;
  /** Fraction of `radius` spent easing into the reveal; 0 is a hard edge, 1 spreads the transition across the whole radius. @default 0.45 */
  softness?: number;
  /** Grain size in CSS pixels — pixels quantise to this before they scatter, so a block this size wanders as one grain. @default 1.5 */
  size?: number;
  /** Peak grain displacement in pixels, scaled by how far the sampled texel's luminance sits from the background. @default 25 */
  scatter?: number;
  /** Idle drift speed for the seeded field. 0 stills it and, once the pointer is also out, stops the rAF loop entirely. @default 1 */
  drift?: number;
  /** Per-channel chromatic offset in pixels at the reveal boundary. @default 2 */
  aberration?: number;
  /** Radial smear in pixels at the reveal boundary. @default 8 */
  bend?: number;
  /** How much a dust grain keeps its own grey versus sinking into the background — 0 is invisible, 1 stays fully grey. @default 0.85 */
  fade?: number;
  /** Colour distance from the background under which a texel counts as background and never turns to dust. @default 0.08 */
  threshold?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Pointer-follow lag shaping the `springs.glide` chase — the default reproduces `springs.glide` as-is; higher loosens it, lower tightens it. @default 0.25 */
  smoothing?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_cursor;
uniform float u_radius;
uniform float u_softness;
uniform float u_size;
uniform float u_scatter;
uniform float u_drift;
uniform float u_tick;
uniform float u_aberration;
uniform float u_bend;
uniform float u_fade;
uniform float u_threshold;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;

  // Reveal amount: 1 at the cursor, 0 past the radius, eased by softness.
  float inner = u_radius * clamp(1.0 - u_softness, 0.0, 1.0);
  float outer = max(u_radius, inner + 1.0);
  float dist = length(px - u_cursor);
  float d = 1.0 - smoothstep(inner, outer, dist);

  // The pixel's own (unjittered) texel decides whether it is background at
  // all, and how far a content grain scatters — brighter-against-bg reaches
  // furthest.
  vec3 home = sampleOver(px / u_res);
  bool isBackground = length(home - u_bg.rgb) < u_threshold;
  float contentBrightness = clamp(abs(kx_luma(home) - kx_luma(u_bg.rgb)) * 2.0, 0.0, 1.0);

  // Quantise to a size-px grain so a whole block wanders together, fed by a
  // seeded field on the grain's cell and the tick, never a random number.
  float grain = max(u_size, 1.0);
  vec2 cell = floor(px / grain) * grain;
  vec2 flow = cell * 0.05 + vec2(u_tick * u_drift * 0.2);
  vec2 offset = (vec2(kx_noise(flow), kx_noise(flow + 19.7)) - 0.5)
    * u_scatter * contentBrightness;

  vec3 dustSample = sampleOver((px + offset) / u_res);
  float grey = kx_luma(dustSample);
  vec3 dust = isBackground ? u_bg.rgb : mix(u_bg.rgb, vec3(grey), u_fade);

  // Chromatic fringe + radial smear, confined to the dust/crisp boundary
  // ring (d between ~0.1 and ~0.9) — the centre of the reveal stays clean.
  float band = smoothstep(0.08, 0.12, d) * (1.0 - smoothstep(0.88, 0.92, d));
  vec2 dir = dist > 0.0001 ? (px - u_cursor) / dist : vec2(0.0);
  vec2 smeared = px + dir * (u_bend * band);
  float ab = u_aberration * band;
  vec3 crisp = vec3(
    sampleOver((smeared + dir * ab) / u_res).r,
    sampleOver(smeared / u_res).g,
    sampleOver((smeared - dir * ab) / u_res).b
  );

  o_color = vec4(mix(dust, crisp, d), 1.0);
}
`;

type DustLayerProps = Required<
  Pick<
    DustRevealProps,
    | "radius"
    | "softness"
    | "size"
    | "scatter"
    | "drift"
    | "aberration"
    | "bend"
    | "fade"
    | "threshold"
    | "smoothing"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a dust
 * grain sampled over a transparent region composites onto the page rather
 * than onto black — the same probe crystal-lens uses for its own backdrop. */
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

// `smoothing` at this reference value reproduces `springs.glide` exactly.
const SMOOTHING_REFERENCE = 0.25;

/**
 * Shapes `springs.glide` by `smoothing`: stiffness and damping scale together
 * (by k and k² respectively) so the damping ratio — the chase's character —
 * never changes, only how quickly it responds.
 */
function glideTransition(smoothing: number): Transition {
  const k = SMOOTHING_REFERENCE / Math.max(smoothing, 0.02);
  return {
    type: "spring",
    stiffness: springs.glide.stiffness * k * k,
    damping: springs.glide.damping * k,
    mass: springs.glide.mass,
  };
}

// Sentinel cursor position, far enough outside any canvas that the reveal
// radius never reaches it.
const OFFSCREEN = -9999;

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, the idle-drift tick and the frame loop; reads everything else from
 * the surface.
 */
function DustLayer({
  radius,
  softness,
  size,
  scatter,
  drift,
  aberration,
  bend,
  fade,
  threshold,
  background,
  smoothing,
}: DustLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(OFFSCREEN);
  const y = useMotionValue<number>(OFFSCREEN);

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
  const paramsRef = React.useRef({
    radius,
    softness,
    size,
    scatter,
    drift,
    aberration,
    bend,
    fade,
    threshold,
    smoothing,
  });
  React.useEffect(() => {
    paramsRef.current = {
      radius,
      softness,
      size,
      scatter,
      drift,
      aberration,
      bend,
      fade,
      threshold,
      smoothing,
    };
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
      u_cursor: [x.get(), y.get()],
      u_radius: p.radius,
      u_softness: p.softness,
      u_size: p.size,
      u_scatter: p.scatter,
      u_drift: p.drift,
      u_tick: tickRef.current,
      u_aberration: p.aberration,
      u_bend: p.bend,
      u_fade: p.fade,
      u_threshold: p.threshold,
      u_bg: bg,
    });
    tri.draw();
  }, [x, y]);

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
    // pointer move or drift tick.
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

  // Every motion-value change and every completed paint asks for a frame —
  // this alone covers the whole reveal whenever the idle loop below is
  // stopped (drift is 0 and the pointer is out).
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The idle-drift loop: a rAF tick that only exists to advance `u_tick` and
  // redraw every frame while the seeded field should be breathing. Gated the
  // same way as the GL effect (only while the surface is active) plus
  // IntersectionObserver/visibilitychange, and stopped outright when there
  // is no drift to animate and no pointer to react to.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host || drift <= 0) return;

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
        // Rebase the clock over the pause so drift resumes, not jumps.
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
  }, [surface.active, surface.host, drift, drawFrame]);

  // Pointer on the host: spring the cursor toward the reveal, snap it in on
  // entry so the first reveal never sweeps in from the offscreen sentinel,
  // and spring it back out on exit.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const transition = glideTransition(paramsRef.current.smoothing);
      animate(x, event.clientX - rect.left, transition);
      animate(y, event.clientY - rect.top, transition);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
    };
    const leave = () => {
      const transition = glideTransition(paramsRef.current.smoothing);
      animate(x, OFFSCREEN, transition);
      animate(y, OFFSCREEN, transition);
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
  }, [surface.host, background, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="dust-reveal"
      className="block h-full w-full"
    />
  );
}

/**
 * The painted interface as fine grey dust: every texel wanders from its home
 * pixel on a seeded noise field, the brightest content scattering furthest,
 * while anything within `threshold` of the background never grains at all —
 * only content becomes dust, background stays background. Bring the cursor
 * near and the dust coalesces back into the crisp, coloured page inside
 * `radius`, with a chromatic fringe and a radial smear marking the boundary
 * where it resolves. Idle, the field keeps drifting on its own tick so the
 * dust breathes without a single `Math.random` call — set `drift` to 0 to
 * still it. The DOM underneath sits at zero opacity, still in flow and still
 * focusable, so every grain drawn is a sample of the real interface.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function DustReveal({
  radius = 380,
  softness = 0.45,
  size = 1.5,
  scatter = 25,
  drift = 1,
  aberration = 2,
  bend = 8,
  fade = 0.85,
  threshold = 0.08,
  background,
  smoothing = 0.25,
  paint,
  className,
  children,
}: DustRevealProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <DustLayer
          radius={radius}
          softness={softness}
          size={size}
          scatter={scatter}
          drift={drift}
          aberration={aberration}
          bend={bend}
          fade={fade}
          threshold={threshold}
          background={background}
          smoothing={smoothing}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
