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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

// Layout effects only ever run client-side here (the file is "use client"),
// but Next.js still warns about useLayoutEffect during SSR module
// evaluation — the same guard glyph-sweep's own copy uses.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type InkBloomProps = {
  /** Which panel is active. Changing it retains the outgoing frame and blooms outward from the origin to the panel at this index. */
  index: number;
  /** Bloom duration in seconds. @default 1 */
  duration?: number;
  /** Strength of the fbm distortion warping the bloom's leading edge. @default 1 */
  feather?: number;
  /** Ink rim strength at the bloom's boundary (0..1). @default 0.6 */
  edge?: number;
  /** Fixed bloom origin, as host-relative fractions [x, y] in 0..1. Overrides the last pointerdown position. */
  origin?: [number, number];
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

/** Walks up from the host to the first opaque background colour, so a
 * transparent texture region composites onto the real page rather than onto
 * black. Mirrors crystal-lens's and glyph-sweep's own copy. */
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

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_progress;
uniform vec2 u_origin;
uniform float u_feather;
uniform float u_edge;
uniform vec3 u_ink;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

// Half-width, in px, of the ink rim traced along the bloom's advancing edge.
const float RIM_WIDTH = 12.0;
// Half-width, in px, of the antialiasing band at the bloom's hard boundary.
const float EDGE_AA = 1.25;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 origin = u_origin * u_res;

  // The farthest corner from the origin — a rectangle's farthest point from
  // any interior point always lands on a vertex, so this is also the
  // farthest any on-screen pixel can be.
  float maxDist = max(
    max(distance(origin, vec2(0.0, 0.0)), distance(origin, vec2(u_res.x, 0.0))),
    max(distance(origin, vec2(0.0, u_res.y)), distance(origin, u_res))
  );
  float radius = u_progress * maxDist * 1.15;

  // A static (position-seeded, never time-seeded) fbm read warps the front
  // so it spreads unevenly, like ink through fibre rather than a perfect
  // circle.
  float front = distance(px, origin) + kx_fbm(px * 0.02) * u_feather * 60.0;
  float d = front - radius;

  vec3 oldColor = sampleOver(u_prev, px / u_res);
  vec3 newColor = u_newReady > 0.5
    ? sampleOver(u_tex, px / u_res)
    : sampleOver(u_prev, px / u_res);

  float insideMask = 1.0 - smoothstep(-EDGE_AA, EDGE_AA, d);
  vec3 base = mix(oldColor, newColor, insideMask);

  // The rim: dark ink on the outer (old) side of the boundary, thinning and
  // tinting toward the colour already sweeping in as the front passes over
  // it.
  float rimMask = 1.0 - smoothstep(0.0, RIM_WIDTH, abs(d));
  float towardNew = clamp((RIM_WIDTH - d) / (2.0 * RIM_WIDTH), 0.0, 1.0);
  vec3 rimColor = mix(u_ink, newColor, towardNew);
  vec3 color = mix(base, rimColor, rimMask * u_edge);

  o_color = vec4(color, 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across blooms) so the outgoing panel survives the DOM switch. */
function retainCopy(
  target: HTMLCanvasElement | null,
  source: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = target ?? document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

type BloomLayerProps = Required<
  Pick<InkBloomProps, "index" | "duration" | "feather" | "edge">
> & { origin?: [number, number]; background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, the pointer-derived origin, and the frame loop; reads everything
 * else from the surface. `index` is the only trigger for a bloom — no idle
 * ticking between them.
 */
function BloomLayer({
  index,
  duration,
  feather,
  edge,
  origin,
  background,
}: BloomLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // blooms, and the correct value before any bloom has ever run.
  const progress = useMotionValue<number>(1);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const prevCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const prevTextureRef = React.useRef<WebGLTexture | null>(null);
  const prevCaptureIdRef = React.useRef(0);
  const prevUploadedIdRef = React.useRef(0);
  const inkRgbRef = React.useRef<[number, number, number]>([0.05, 0.04, 0.07]);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const prevIndexRef = React.useRef(index);
  const sweepControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a bloom starts until the painter lands a version newer than
  // the one in force when it started.
  const newReadyRef = React.useRef(true);
  const sweepStartVersionRef = React.useRef(0);

  // The last pointerdown anywhere on the document, as a fraction of this
  // host's own box — the fallback origin when `origin` is not supplied.
  const pointerOriginRef = React.useRef<[number, number]>([0.5, 0.5]);
  // The origin actually driving the in-flight (or most recently finished)
  // bloom, locked in the instant a bloom starts so a later pointer move or
  // prop change never retargets it mid-flight.
  const activeOriginRef = React.useRef<[number, number]>([0.5, 0.5]);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });

  const paramsRef = React.useRef({ feather, edge });
  React.useEffect(() => {
    paramsRef.current = { feather, edge };
  });

  // One frame: upload whatever textures landed since the last draw, then
  // composite the outgoing texture, the ink rim, and the incoming texture in
  // a single pass.
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

    if (!newReadyRef.current && live.version > sweepStartVersionRef.current) {
      newReadyRef.current = true;
    }

    if (
      prevUploadedIdRef.current !== prevCaptureIdRef.current &&
      prevCanvasRef.current
    ) {
      prevTextureRef.current = uploadTexture(
        gl,
        prevCanvasRef.current,
        { linear: true, wrap: "clamp" },
        prevTextureRef.current,
      );
      prevUploadedIdRef.current = prevCaptureIdRef.current;
    }
    // Before the first bloom nothing has been retained yet. Falling back to
    // the current texture is harmless — at progress 1 the shader never
    // actually samples u_prev.
    const prevTexture = prevTextureRef.current ?? texture;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_prev", prevTexture, 0);
    program.texture("u_tex", texture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_progress: progress.get(),
      u_origin: activeOriginRef.current,
      u_feather: p.feather,
      u_edge: p.edge,
      u_ink: inkRgbRef.current,
      u_bg: bg,
      u_newReady: newReadyRef.current ? 1 : 0,
    });
    tri.draw();
  }, [progress]);

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
    prevUploadedIdRef.current = 0;
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
    // A paint (or a retained frame) may already be waiting: draw it now
    // rather than on the next index change.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (prevTextureRef.current) gl.deleteTexture(prevTextureRef.current);
      prevTextureRef.current = null;
      prevUploadedIdRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The bloom's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between blooms.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the ink rim colour through the real cascade — var(--ink) needs
  // the host's own theme scope, not the document root's.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor("var(--ink)", host);
    inkRgbRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Track the last pointerdown anywhere on the document, converted to a
  // fraction of this host's own box. Capture phase, so a switcher rendered
  // above the stage — outside the host entirely — still sets where the ink
  // starts: a press above the host's top edge clamps to y = 0 the same way a
  // press left or right of it clamps in x.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const capture = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const fx =
        rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
      const fy =
        rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
      pointerOriginRef.current = [clamp(fx, 0, 1), clamp(fy, 0, 1)];
    };
    document.addEventListener("pointerdown", capture, true);
    return () => document.removeEventListener("pointerdown", capture, true);
  }, [surface.host]);

  // The bloom trigger: retain the outgoing frame and lock in this bloom's
  // origin the moment `index` changes, then run `progress` 0 → 1. A layout
  // effect so the retain runs synchronously against the pre-swap paint, in
  // the same tick React committed the new panel — before the painter has had
  // a chance to repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    sweepControlsRef.current?.stop();
    activeOriginRef.current = origin ?? pointerOriginRef.current;
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no bloom to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    sweepStartVersionRef.current = live.version;

    progress.jump(0);
    sweepControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the bloom finishes, but if it somehow
        // has not, stop waiting on it rather than hold the far side of the
        // bloom on stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, origin, progress, requestFrame]);

  // A bloom in flight must not outlive the component.
  React.useEffect(
    () => () => {
      sweepControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="ink-bloom"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels that blooms outward from wherever the pointer
 * last pressed, following glyph-sweep's own panel plumbing: only the active
 * panel ever renders into the painted DOM, and the outgoing one is retained
 * into its own canvas the instant `index` changes, before the painter has
 * redrawn anything. The bloom's leading edge is a distance field from that
 * origin, warped by a static kx_fbm read at every pixel — fixed to that
 * pixel's own position, never to time — so the front spreads unevenly like
 * ink through fibre rather than tracing a perfect circle. A dark rim drawn
 * from the ink token traces that edge at `edge` strength, thinning and
 * tinting toward the incoming panel's own colour as the bloom sweeps past
 * it. The origin is the last pointerdown anywhere on the document, read as a
 * fraction of this component's own box, so pressing a switcher rendered
 * above the stage still aims the bloom; pass `origin` directly to pin it
 * instead.
 * Reduced motion: panels swap instantly and this layer renders nothing, same
 * as glyph-sweep — the real DOM shows the active panel directly.
 */
export function InkBloom({
  index,
  duration = 1,
  feather = 1,
  edge = 0.6,
  origin,
  background,
  paint,
  className,
  children,
}: InkBloomProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <BloomLayer
          index={activeIndex}
          duration={duration}
          feather={feather}
          edge={edge}
          origin={origin}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
