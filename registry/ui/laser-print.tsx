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

export type LaserPrintMode = "scroll" | "auto" | "manual";

export type LaserPrintProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "auto" fills once on a timer when the host first appears; "manual" takes `progress` directly. @default "scroll" */
  mode?: LaserPrintMode;
  /** The print position for `mode="manual"`, 0 (nothing printed) to 1 (fully printed). Ignored otherwise. */
  progress?: number;
  /** Fill duration in seconds for `mode="auto"`. @default 2.4 */
  duration?: number;
  /** Beam colour, resolved against the host so `var(--token)` reads the right theme. @default "var(--primary)" */
  color?: string;
  /** Bright core width in CSS pixels. @default 3 */
  beamWidth?: number;
  /** Soft halo radius in CSS pixels around the core. @default 40 */
  glow?: number;
  /** Spark density near the line while printing; 0 disables. @default 1 */
  sparks?: number;
  /** Heat-shimmer strength in the blank band just ahead of the line. @default 0.5 */
  shimmer?: number;
  /** Darken/desaturate strength of the scorch band just behind the line. @default 0.15 */
  scorch?: number;
  /** Sweep direction. "down" prints top to bottom; "up" flips it. @default "down" */
  direction?: "down" | "up";
  /** Fill colour for the unprinted stock; defaults to the host's own effective background. */
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
uniform vec4 u_color;
uniform float u_beamWidth;
uniform float u_glow;
uniform float u_sparks;
uniform float u_shimmer;
uniform float u_scorch;
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

// A handful of small, flickering points riding the line. Seeded by a pixel
// cell and the tick, never by a random call.
float sparkField(vec2 px, float s, float beamS, float density, float tick) {
  float band = 20.0;
  float dLine = abs(s - beamS);
  if (dLine > band) return 0.0;
  float cell = mix(30.0, 8.0, clamp(density, 0.0, 2.0) * 0.5);
  vec2 gcell = floor(px / cell);
  float seed = kx_hash(gcell);
  float slot = floor(tick * 5.0 + seed * 41.0);
  float id = kx_hash(gcell + slot * 0.137);
  float chance = clamp(density, 0.0, 2.0) * 0.3;
  if (id > chance) return 0.0;
  vec2 jitter = vec2(kx_hash(gcell + slot + 3.7), kx_hash(gcell + slot + 8.3));
  vec2 sparkPx = (gcell + jitter) * cell;
  float distSpark = length(px - sparkPx);
  float life = fract(tick * 5.0 + seed * 41.0);
  float twinkle = smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.55, 1.0, life));
  float glowPt = clamp(1.0 - distSpark / 2.2, 0.0, 1.0);
  glowPt *= glowPt;
  return glowPt * twinkle;
}

void main() {
  vec2 px = v_uv * u_res;
  // Sweep-space coordinate: 0 at the edge the beam starts from, growing to
  // u_res.y at the edge it finishes at. "up" just swaps which edge that is.
  float s = mix(px.y, u_res.y - px.y, u_dir);
  float p = clamp(u_progress, 0.0, 1.0);
  float beamS = p * u_res.y;
  float edgeFade = smoothstep(0.0, 0.015, p) * (1.0 - smoothstep(0.985, 1.0, p));

  vec3 color;
  if (s < beamS) {
    // Printed: the crisp texture, with a scorch band riding just behind the line.
    vec3 tex = sampleOver(v_uv);
    float scorchD = clamp((beamS - s) / 24.0, 0.0, 1.0);
    float scorchAmt = (1.0 - scorchD) * u_scorch * edgeFade;
    vec3 desat = mix(tex, vec3(kx_luma(tex)), 0.6) * 0.78;
    color = mix(tex, desat, scorchAmt);
  } else {
    // Blank stock, with a faint heat-shimmer ghost of what is about to print.
    float bandT = clamp((s - beamS) / 40.0, 0.0, 1.0);
    vec2 wave = vec2(sin(px.x * 0.05 + u_tick * 2.4) * 5.0 * u_shimmer, 0.0);
    vec3 ghost = sampleOver((px + wave) / u_res);
    float ghostAlpha = (1.0 - bandT) * 0.06 * u_shimmer * edgeFade;
    color = mix(u_bg.rgb, ghost, ghostAlpha);
  }

  // The beam itself: a bright core plus a softer halo, lightened over
  // whatever the printed/blank composite above already drew.
  float d = abs(s - beamS);
  float halfCore = max(u_beamWidth, 0.5) * 0.5;
  float core = 1.0 - smoothstep(halfCore * 0.6, halfCore, d);
  float haloR = max(u_glow, 1.0);
  float halo = clamp(1.0 - d / haloR, 0.0, 1.0);
  halo *= halo;
  vec3 hot = mix(u_color.rgb, vec3(1.0), 0.55);
  color = mix(color, hot, core * edgeFade);
  color += hot * halo * 0.4 * edgeFade * (1.0 - core);

  // Sparks, only while the beam is actually mid-sweep.
  if (p > 0.0 && p < 1.0) {
    float spark = sparkField(px, s, beamS, u_sparks, u_tick) * edgeFade;
    color += vec3(1.0) * spark;
  }

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type PrintLayerProps = Required<
  Pick<
    LaserPrintProps,
    | "mode"
    | "duration"
    | "color"
    | "beamWidth"
    | "glow"
    | "sparks"
    | "shimmer"
    | "scorch"
    | "direction"
  >
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Walks up from the host to the first opaque background colour, so the
 * blank stock composites onto the page rather than onto black — the same
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
function PrintLayer({
  mode,
  progress: progressProp,
  duration,
  color,
  beamWidth,
  glow,
  sparks,
  shimmer,
  scorch,
  direction,
  background,
}: PrintLayerProps) {
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
  const colorRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    direction,
    beamWidth,
    glow,
    sparks,
    shimmer,
    scorch,
  });
  React.useEffect(() => {
    paramsRef.current = { direction, beamWidth, glow, sparks, shimmer, scorch };
  }, [direction, beamWidth, glow, sparks, shimmer, scorch]);

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
      u_color: colorRef.current,
      u_beamWidth: p.beamWidth,
      u_glow: p.glow,
      u_sparks: p.sparks,
      u_shimmer: p.shimmer,
      u_scorch: p.scorch,
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

  // Resolve the beam colour and the blank-stock background against the
  // host, so `var(--token)` reads the theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, background, color, requestFrame]);

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
    // Compute immediately so a host already in view prints correctly
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
  // the surface is active, the host is on screen, and the beam is actually
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
      data-effect-canvas="laser-print"
      className="block h-full w-full"
    />
  );
}

/**
 * A beam that prints the interface in as you scroll. Progress is the
 * host's place in the viewport — `mode="scroll"` reads it straight off
 * `host.getBoundingClientRect()` on every scroll and resize, `mode="auto"`
 * fills it once on a timer the moment the host first appears, and
 * `mode="manual"` takes the number from you. Above the line the page
 * prints crisp and true; at the line a hot core, a scatter of sparks and a
 * band of heat shimmer mark the work in progress; below it sits blank
 * stock, the plain background. The real DOM stays mounted beneath the
 * canvas the entire time, in flow and focusable, simply unpainted until the
 * beam reaches it.
 * Reduced motion: SurfacePaint shows the real DOM already fully printed and this layer renders nothing.
 */
export function LaserPrint({
  mode = "scroll",
  progress,
  duration = 2.4,
  color = "var(--primary)",
  beamWidth = 3,
  glow = 40,
  sparks = 1,
  shimmer = 0.5,
  scorch = 0.15,
  direction = "down",
  background,
  paint,
  className,
  children,
}: LaserPrintProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PrintLayer
          mode={mode}
          progress={progress}
          duration={duration}
          color={color}
          beamWidth={beamWidth}
          glow={glow}
          sparks={sparks}
          shimmer={shimmer}
          scorch={scorch}
          direction={direction}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
