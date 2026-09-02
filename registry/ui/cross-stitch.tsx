"use client";

import * as React from "react";

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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type CrossStitchProps = {
  /** Stitch cell size in CSS pixels — the grid the page is quantised into. @default 6 */
  cell?: number;
  /** Thread width in CSS pixels. @default 2.4 */
  thread?: number;
  /** Cloth ground colour, shown wherever a cell reads as empty. @default "#efe7d8" */
  cloth?: string;
  /** Highlight travel speed along each thread; 0 stitches once and holds still. @default 0.6 */
  shimmer?: number;
  /** Effective-background reference used to decide which cells read as empty. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_cell;
uniform float u_thread;
uniform vec4 u_cloth;
uniform vec4 u_bg;
uniform float u_shimmer;
uniform float u_tick;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Distance from p to the segment a-b, and the clamped projection h in
// [0, 1] along it -- h doubles as the thread's own highlight parameter.
vec2 segmentDistAndParam(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return vec2(length(pa - ba * h), h);
}

// One diagonal thread: a capsule shaded like a round strand of thread, with
// a travelling highlight seeded per cell. Returns straight colour (rgb) and
// coverage (a, 0 outside the capsule, 1 at its core) for the caller to layer.
vec4 stitchThread(vec2 local, vec2 a, vec2 b, float r, float seed, vec3 threadColor) {
  vec2 dh = segmentDistAndParam(local, a, b);
  float d = dh.x;
  float h = dh.y;
  float sdf = d - r;
  float aa = max(fwidth(sdf), 0.001);
  float coverage = 1.0 - smoothstep(-aa, aa, sdf);

  float cyl = sqrt(max(0.0, 1.0 - (d / r) * (d / r)));
  float brightness = 0.7 + 0.5 * cyl;

  // The bright spot ambles along the strand on a wrapped Gaussian, so it
  // loops smoothly rather than popping when it reaches either end.
  float u = fract(u_tick * u_shimmer * 0.3 + seed);
  float diff = h - u;
  diff -= floor(diff + 0.5);
  float glow = exp(-0.5 * (diff * diff) / (0.15 * 0.15));

  vec3 shaded = mix(threadColor * brightness, vec3(1.0), glow * 0.8);
  return vec4(shaded, coverage);
}

void main() {
  vec2 px = v_uv * u_res;
  float cellPx = max(u_cell, 1.0);
  vec2 cellId = floor(px / cellPx);
  vec2 origin = cellId * cellPx;
  vec2 local = px - origin;
  vec2 center = origin + vec2(cellPx * 0.5);

  // The cell's own colour, sampled once at its centre and composited over
  // the reference background -- a fully transparent texel lands exactly on
  // u_bg, so "transparent" and "close to background" collapse into one test.
  vec3 cellColor = sampleOver(center / u_res);
  bool empty = distance(cellColor, u_bg.rgb) < 0.04;

  vec3 cloth = u_cloth.rgb;
  vec3 color = cloth;

  if (empty) {
    // The weave's own hole grid: a small darker dot at every cell corner.
    vec2 c00 = vec2(0.0, 0.0);
    vec2 c10 = vec2(cellPx, 0.0);
    vec2 c01 = vec2(0.0, cellPx);
    vec2 c11 = vec2(cellPx, cellPx);
    float dCorner = min(
      min(length(local - c00), length(local - c10)),
      min(length(local - c01), length(local - c11))
    );
    float aa = max(fwidth(dCorner), 0.001);
    float dotAlpha = 1.0 - smoothstep(0.9 - aa, 0.9 + aa, dCorner);
    color = mix(color, cloth * 0.68, dotAlpha);
  } else {
    float r = max(u_thread, 1.0) * 0.5;
    float seed = kx_hash(cellId);
    vec4 a = stitchThread(local, vec2(0.0, 0.0), vec2(cellPx, cellPx), r, seed, cellColor);
    color = mix(color, a.rgb, a.a);
    // The second thread crosses over the first, so it is layered on top.
    vec4 b = stitchThread(local, vec2(cellPx, 0.0), vec2(0.0, cellPx), r, seed, cellColor);
    color = mix(color, b.rgb, b.a);
  }

  o_color = vec4(color, 1.0);
}
`;

type CrossStitchLayerProps = Required<
  Pick<CrossStitchProps, "cell" | "thread" | "cloth" | "shimmer">
> & { background?: string };

/** Walks up from the host to the first opaque background colour -- the same
 * probe crystal-lens, dust-reveal, and hex-floor use for their own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture, the idle-shimmer
 * tick, and the frame loop; reads everything else from the surface. There is
 * no pointer state here -- the pattern is driven by time alone.
 */
function CrossStitchLayer({
  cell,
  thread,
  cloth,
  shimmer,
  background,
}: CrossStitchLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const clothRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ cell, thread, shimmer });
  React.useEffect(() => {
    paramsRef.current = { cell, thread, shimmer };
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

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const clothColor = clothRef.current;
    gl.clearColor(clothColor[0], clothColor[1], clothColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_cell: p.cell,
      u_thread: p.thread,
      u_cloth: clothColor,
      u_bg: bgRef.current,
      u_shimmer: p.shimmer,
      u_tick: tickRef.current,
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
    // shimmer tick.
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

  // Every completed paint asks for a frame -- this alone covers the whole
  // effect whenever the idle loop below is stopped (shimmer is 0).
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The idle-shimmer loop: a rAF tick that only exists to advance u_tick and
  // redraw every frame while the highlight should be travelling. Gated the
  // same way as the GL effect (only while the surface is active) plus
  // IntersectionObserver/visibilitychange, and stopped outright when there
  // is no shimmer to animate -- dust-reveal's idle loop shape.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host || shimmer <= 0) return;

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
        // Rebase the clock over the pause so the shimmer resumes, not jumps.
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
  }, [surface.active, surface.host, shimmer, drawFrame]);

  // Colours resolve against the host so var(--token) reads the theme that
  // applies to it, and again whenever the host or either colour prop changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    clothRef.current = resolveColor(cloth, host);
    requestFrame();
  }, [surface.host, background, cloth, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="cross-stitch"
      className="block h-full w-full"
    />
  );
}

/**
 * The painted page laid out as cross-stitch on cloth: the canvas is
 * quantised into `cell`-pixel squares, each sampled once at its centre, and
 * any square that lands within a hair of the effective background reads as
 * empty linen -- flat cloth colour, punched with a small darker dot at every
 * corner for the weave's own hole grid. A square that actually holds content
 * is stitched: two diagonal capsules cross it corner to corner, shaded like
 * a cylinder of thread and carrying a highlight that ambles along each
 * strand, seeded per cell from a hash so the shimmer never lands in lockstep
 * across the grid. The DOM underneath sits at zero opacity, still in flow
 * and still focusable, so every square is a sample of the real interface.
 * Reduced motion: SurfacePaint shows the real DOM and this layer renders
 * nothing.
 */
export function CrossStitch({
  cell = 6,
  thread = 2.4,
  cloth = "#efe7d8",
  shimmer = 0.6,
  background,
  paint,
  className,
  children,
}: CrossStitchProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <CrossStitchLayer
          cell={cell}
          thread={thread}
          cloth={cloth}
          shimmer={shimmer}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
