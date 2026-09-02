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

export type LiquidWipeProps = {
  /** Which panel is active. Changing it retains the outgoing frame and pours a liquid front down the surface to the panel at this index. */
  index: number;
  /** Pour duration in seconds. @default 1.2 */
  duration?: number;
  /** Amplitude of the noise that perturbs the pour front (0 flattens it to a straight line). @default 1 */
  wave?: number;
  /** Scales the sine ripple that refracts the wet band trailing the front. @default 1 */
  refraction?: number;
  /** Liquid tint — the wet band and the drip columns. CSS; resolved with `resolveColor`. @default "#38bdf8" */
  color?: string;
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
uniform float u_wave;
uniform float u_refraction;
uniform vec3 u_color;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

// How far above the front the wet band reaches, in px.
const float WET_BAND = 60.0;
// Meniscus line half-width and glow reach, in px.
const float MENISCUS_HALF = 1.0;
const float MENISCUS_GLOW = 10.0;
// Drips leading the front: how many, and how wide each column is, in px.
const int DRIP_COUNT = 5;
const float DRIP_HALF = 2.5;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// The pour front's y position at a given x: a noise-perturbed line that
// sweeps from above the top (progress 0) to below the bottom (progress 1),
// so the whole surface passes through it once per transition.
float edgeAt(float x) {
  return u_progress * (u_res.y + 80.0) - 80.0
    + kx_fbm(vec2(x * 0.02, u_progress * 3.0)) * u_wave * 40.0;
}

// Rounded-column coverage for a drip: 1 on the capsule's core, feathered
// over about two pixels at its rim.
float capsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  float d = length(pa - ba * h) - r;
  return 1.0 - smoothstep(-1.0, 1.0, d);
}

void main() {
  vec2 px = v_uv * u_res;
  float edge = edgeAt(px.x);
  float dist = px.y - edge;

  vec3 newColor = u_newReady > 0.5
    ? sampleOver(u_tex, px / u_res)
    : sampleOver(u_prev, px / u_res);

  vec3 result;
  if (dist < 0.0) {
    // Above the front: the incoming panel, freshly poured over.
    result = newColor;
    float band = -dist;
    float inBand = 1.0 - smoothstep(WET_BAND - 4.0, WET_BAND, band);
    if (inBand > 0.0) {
      float ripple = sin(px.x * 0.1 + u_progress * 12.0) * 3.0 * u_refraction;
      vec2 wetUv = (px + vec2(0.0, ripple)) / u_res;
      vec3 wetColor = u_newReady > 0.5
        ? sampleOver(u_tex, wetUv)
        : sampleOver(u_prev, wetUv);
      result = mix(result, wetColor, inBand);
      result = mix(result, u_color, 0.18 * inBand);
    }
  } else {
    // Below the front: the outgoing panel, dry except for the drips the
    // front leaves hanging ahead of itself.
    result = sampleOver(u_prev, px / u_res);
    float coverage = 0.0;
    for (int i = 0; i < DRIP_COUNT; i += 1) {
      float fi = float(i);
      float dripX = kx_hash(vec2(fi, 11.0)) * u_res.x;
      float dripLen = kx_hash(vec2(fi, 23.0)) * 40.0;
      float dripEdge = edgeAt(dripX);
      vec2 top = vec2(dripX, dripEdge);
      vec2 bottom = vec2(dripX, dripEdge + dripLen);
      coverage = max(coverage, capsule(px, top, bottom, DRIP_HALF));
    }
    result = mix(result, u_color, coverage * 0.85);
  }

  // The meniscus: a bright line right at the front with a soft glow either
  // side, drawn over both the wet band and the dry drips.
  float absDist = abs(dist);
  float glow = (1.0 - smoothstep(0.0, MENISCUS_GLOW, absDist)) * 0.35;
  float line = 1.0 - smoothstep(0.0, MENISCUS_HALF * 2.0, absDist);
  result = mix(result, vec3(1.0), glow);
  result = mix(result, mix(vec3(1.0), u_color, 0.25), line);

  o_color = vec4(result, 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across pours) so the outgoing panel survives the DOM switch. */
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

type WipeLayerProps = Required<
  Pick<LiquidWipeProps, "index" | "duration" | "wave" | "refraction" | "color">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, and the frame loop; reads everything else from the surface.
 * `index` is the only trigger for a pour — no idle ticking between them.
 */
function WipeLayer({
  index,
  duration,
  wave,
  refraction,
  color,
  background,
}: WipeLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // pours, and the correct value before any pour has ever run.
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
  const colorRgbRef = React.useRef<[number, number, number, number]>([
    1, 1, 1, 1,
  ]);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const prevIndexRef = React.useRef(index);
  const pourControlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a pour starts until the painter lands a version newer than
  // the one in force when it started.
  const newReadyRef = React.useRef(true);
  const pourStartVersionRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });

  const paramsRef = React.useRef({ wave, refraction });
  React.useEffect(() => {
    paramsRef.current = { wave, refraction };
  });

  // One frame: upload whatever textures landed since the last draw, then
  // composite the outgoing texture, the pour front, and the incoming
  // texture in a single pass.
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

    if (!newReadyRef.current && live.version > pourStartVersionRef.current) {
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
    // Before the first pour nothing has been retained yet. Falling back to
    // the current texture is harmless — at progress 1 the shader never
    // actually samples u_prev for the visible region.
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
      u_wave: p.wave,
      u_refraction: p.refraction,
      u_color: [
        colorRgbRef.current[0],
        colorRgbRef.current[1],
        colorRgbRef.current[2],
      ],
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
    prevUploadedIdRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

  // The pour's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between pours.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the liquid tint through the real cascade — a hex value passes
  // through unchanged, `var(--token)` needs the host's own theme scope.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRgbRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The pour trigger: retain the outgoing frame the moment `index` changes,
  // then run `progress` 0 → 1. A layout effect so the retain runs
  // synchronously against the pre-swap paint, in the same tick React
  // committed the new panel — before the painter has had a chance to
  // repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    pourControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no pour to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    pourStartVersionRef.current = live.version;

    progress.jump(0);
    pourControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the pour finishes, but if it somehow
        // has not, stop waiting on it rather than hold the dry side on
        // stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A pour in flight must not outlive the component.
  React.useEffect(
    () => () => {
      pourControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="liquid-wipe"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels: change `index` and a liquid front pours down
 * the surface, the incoming panel setting in above the waterline while the
 * outgoing one still shows dry below it. The front is one noisy line — fbm
 * keeps it from ever reading as a straight wipe — trailed by a wet band that
 * refracts the fresh texture through a small sine ripple and tinted at the
 * liquid's own colour, and led on the dry side by five drip columns whose
 * position and length are hashed from their own index, so the same five
 * drips fall in the same place on every pour. Only the active panel ever
 * renders into the painted DOM; the outgoing texture is retained into its
 * own canvas the instant `index` changes, before the painter has redrawn
 * anything, so the pour never waits on a paint to start.
 * Reduced motion: panels swap instantly with no pour, and this layer
 * renders nothing — the real DOM shows the active panel directly.
 */
export function LiquidWipe({
  index,
  duration = 1.2,
  wave = 1,
  refraction = 1,
  color = "#38bdf8",
  background,
  paint,
  className,
  children,
}: LiquidWipeProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <WipeLayer
          index={activeIndex}
          duration={duration}
          wave={wave}
          refraction={refraction}
          color={color}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
