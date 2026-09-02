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
import { easings, springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type SandScrollMode = "scroll" | "auto" | "manual";

export type SandScrollProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "auto" fills once on a timer when the host first appears; "manual" takes `progress` directly. @default "scroll" */
  mode?: SandScrollMode;
  /** The settle position for `mode="manual"`, 0 (fully sand) to 1 (fully settled). Ignored otherwise. */
  progress?: number;
  /** Fill duration in seconds for `mode="auto"`. @default 2.4 */
  duration?: number;
  /** Grain size in CSS pixels — pixels quantise to this before they scatter, so a block this size wanders as one grain. @default 2 */
  grain?: number;
  /** Peak horizontal grain scatter in pixels at full looseness. @default 24 */
  scatter?: number;
  /** Downward drift speed for loose grains; 0 stills the stream while scatter still applies. @default 1 */
  fall?: number;
  /** Depth in CSS pixels below the line over which a grain goes from freshly loosened to fully adrift, and the span the streaming grains cycle within. @default 220 */
  softness?: number;
  /** How far a fully loose grain sinks toward the background versus keeping its own colour, scaled by depth. @default 0.5 */
  fade?: number;
  /** Sweep direction. "down" settles top to bottom as you scroll down; "up" flips it. @default "down" */
  direction?: "down" | "up";
  /** Fill colour for the loose sand and blank composite; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_progress;
uniform float u_dir;
uniform float u_grain;
uniform float u_scatter;
uniform float u_fall;
uniform float u_softness;
uniform float u_fade;
uniform float u_tick;
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
  // Sweep-space coordinate: 0 at the edge the line starts from, growing to
  // u_res.y at the edge it finishes at. "up" just swaps which edge that is.
  float s = mix(px.y, u_res.y - px.y, u_dir);
  float p = clamp(u_progress, 0.0, 1.0);
  float lineS = p * u_res.y;
  float soft = max(u_softness, 1.0);
  // 0 right at (or above) the line, 1 once a grain is a full softness band below it.
  float depth = clamp((s - lineS) / soft, 0.0, 1.0);
  float edgeFade = smoothstep(0.0, 0.01, p) * (1.0 - smoothstep(0.99, 1.0, p));

  vec3 color;
  if (depth <= 0.0) {
    // Settled: the crisp texture, untouched.
    color = sampleOver(v_uv);
  } else {
    // Loose: quantise to a grain cell so a whole block wanders together, fed
    // by a seeded field keyed on the grain's cell and the tick — nothing
    // stored between frames, no random call.
    float grainPx = max(u_grain, 1.0);
    vec2 cell = floor(px / grainPx) * grainPx;
    float hash = kx_hash(cell);
    vec2 seed = cell * 0.08 + vec2(u_tick * 0.35, 0.0);
    float driftX = kx_noise(seed) - 0.5;

    // The fall term is wrapped within the loose band so grains stream
    // downward forever rather than sampling further and further offscreen.
    float wrapLen = max(soft, 40.0);
    float fallDist = mod(48.0 * u_fall * u_tick * depth * (0.5 + hash), wrapLen);

    vec2 offset = vec2(driftX * u_scatter * depth, -fallDist);

    // The pixel's own (unjittered) texel decides whether it is background at
    // all — background never grains, it just stays background.
    vec3 home = sampleOver(px / u_res);
    bool isBackground = length(home - u_bg.rgb) < 0.08;

    vec3 grainSample = sampleOver((px + offset) / u_res);
    vec3 desat = mix(grainSample, vec3(kx_luma(grainSample)), 0.35);
    vec3 dust = mix(desat, u_bg.rgb, clamp(u_fade * depth, 0.0, 1.0));
    color = isBackground ? u_bg.rgb : dust;
  }

  // A thin bright settling band right at the line, only while actively
  // mid-sweep — grains snapping into place as it passes.
  float bandDist = abs(s - lineS);
  float band = (1.0 - smoothstep(0.0, 2.5, bandDist)) * edgeFade;
  color = mix(color, mix(color, vec3(1.0), 0.6), band);

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type SandLayerProps = Required<
  Pick<
    SandScrollProps,
    | "mode"
    | "duration"
    | "grain"
    | "scatter"
    | "fall"
    | "softness"
    | "fade"
    | "direction"
  >
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Walks up from the host to the first opaque background colour, so the
 * loose sand composites onto the page rather than onto black — the same
 * probe crystal-lens uses for its own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture, the progress
 * motion value and the frame loop; reads everything else from the surface.
 */
function SandLayer({
  mode,
  progress: progressProp,
  duration,
  grain,
  scatter,
  fall,
  softness,
  fade,
  direction,
  background,
}: SandLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const progress = useMotionValue<number>(0);

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
    direction,
    grain,
    scatter,
    fall,
    softness,
    fade,
  });
  React.useEffect(() => {
    paramsRef.current = { direction, grain, scatter, fall, softness, fade };
  }, [direction, grain, scatter, fall, softness, fade]);

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
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_progress: progress.get(),
      u_dir: p.direction === "up" ? 1 : 0,
      u_grain: p.grain,
      u_scatter: p.scatter,
      u_fall: p.fall,
      u_softness: p.softness,
      u_fade: p.fade,
      u_tick: tickRef.current,
      u_bg: bg,
    });
    tri.draw();
  }, [progress]);

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
    // scroll or tick.
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

  // Every progress change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsub = progress.on("change", requestFrame);
    return unsub;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the blank-sand background against the host, so `var(--token)`
  // reads the theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // mode="manual": the prop drives the motion value directly, no spring.
  React.useEffect(() => {
    if (mode !== "manual") return;
    progress.jump(clamp01(progressProp ?? 0));
  }, [mode, progressProp, progress]);

  // mode="scroll" | "auto": the motion value is driven either by the
  // host's place in the viewport (springed toward on every scroll/resize)
  // or by a one-shot timed fill the first time the host intersects.
  React.useEffect(() => {
    if (mode === "manual") return;
    const host = surface.host;
    if (!host) return;

    if (mode === "auto") {
      progress.jump(0);
      let started = false;
      let controls: ReturnType<typeof animate> | null = null;
      const io = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last?.isIntersecting && !started) {
          started = true;
          controls = animate(progress, 1, { duration, ease: easings.enter });
        }
      });
      io.observe(host);
      return () => {
        io.disconnect();
        controls?.stop();
      };
    }

    // mode === "scroll"
    const computeProgress = (): number => {
      const rect = host.getBoundingClientRect();
      const vh = window.innerHeight;
      const denom = vh * 0.55 + rect.height;
      const raw = denom > 0 ? (vh - rect.top) / denom : 0;
      return clamp01(raw);
    };
    // Compute immediately so a host already in view settles correctly
    // before the first scroll event ever fires.
    progress.jump(computeProgress());
    const onScroll = () => {
      animate(progress, computeProgress(), springs.glide);
    };
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [mode, duration, surface.host, progress]);

  // The tick loop: advances u_tick and redraws every frame, but only while
  // the surface is active, the host is on screen, and the line is actually
  // mid-sweep (0 < progress < 1). Anywhere else — done, not started, off
  // screen, tab hidden — it stops outright and leaves a single frozen frame.
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

    const shouldTick = (): boolean => {
      const p = progress.get();
      return inView && !document.hidden && p > 0 && p < 1;
    };

    const syncLoop = () => {
      if (shouldTick()) {
        if (raf === 0) {
          // Rebase the clock over the pause so the field resumes, not jumps.
          if (started !== null && pausedAt !== null) {
            started += performance.now() - pausedAt;
          }
          pausedAt = null;
          raf = requestAnimationFrame(tick);
        }
      } else if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
        requestFrame();
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
    const unsubProgress = progress.on("change", syncLoop);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubProgress();
    };
  }, [surface.active, surface.host, progress, drawFrame, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="sand-scroll"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as it dissolves into sand below a line, and reassembles as
 * you scroll past it. Above the line the texture stays crisp; below, grains
 * quantised to `grain` scatter sideways and stream downward, sampling the
 * surface some distance above their own pixel so the field feels like it is
 * perpetually falling — a seeded field keyed by pixel and time, nothing
 * stored between frames. The deeper a grain sits below the line the further
 * it scatters and the more it fades toward the background, until a thin
 * bright band right at the line marks where grains snap back into place.
 * `mode="scroll"` reads the host's place in the viewport, `mode="auto"`
 * fills once on a timer, and `mode="manual"` takes `progress` directly.
 * Reduced motion: SurfacePaint shows the real DOM fully settled and this layer renders nothing.
 */
export function SandScroll({
  mode = "scroll",
  progress,
  duration = 2.4,
  grain = 2,
  scatter = 24,
  fall = 1,
  softness = 220,
  fade = 0.5,
  direction = "down",
  background,
  paint,
  className,
  children,
}: SandScrollProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SandLayer
          mode={mode}
          progress={progress}
          duration={duration}
          grain={grain}
          scatter={scatter}
          fall={fall}
          softness={softness}
          fade={fade}
          direction={direction}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
