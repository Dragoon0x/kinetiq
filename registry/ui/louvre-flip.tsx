"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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

// Layout effects only ever run client-side here (the file is "use client"),
// but Next.js still warns about useLayoutEffect during SSR module
// evaluation — the same guard glyph-sweep's own copy uses.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type LouvreFlipProps = {
  /** Which panel is showing. Changing it retains the outgoing frame and flips the slats over to the panel at this index. */
  index: number;
  /** How many horizontal slats the surface splits into. @default 9 */
  slats?: number;
  /** Full flip duration in seconds, from the first slat starting to the last one settling. @default 1.1 */
  duration?: number;
  /** Delay before the next slat down starts its own flip, as a fraction of `duration`. @default 0.06 */
  stagger?: number;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform float u_progress;
uniform float u_slats;
uniform float u_stagger;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

const float PI = 3.14159265359;
const float HALF_PI = 1.57079632679;
// A small horizontal narrowing at the most edge-on point of the flip
// (angle = PI/2), easing back out at both ends — a cheap stand-in for
// real perspective on a slat that has no actual depth.
const float PERSPECTIVE = 0.14;
// The hinge shadow: half-width in slat-local v, and its peak darkening.
const float HINGE_WIDTH = 0.03;
const float HINGE_DARK = 0.4;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  float slats = max(u_slats, 1.0);
  float rowF = v_uv.y * slats;
  float s = floor(rowF);
  // Local position within this slat: 0 at its top edge, 1 at its bottom.
  float v = fract(rowF);

  float denom = max(1.0 - (slats - 1.0) * u_stagger, 0.2);
  float p = clamp((u_progress - s * u_stagger) / denom, 0.0, 1.0);
  p = smoothstep(0.0, 1.0, p);

  float angle = p * PI;
  float c = cos(angle);
  float absC = abs(c);

  // Map this screen pixel's local v back to the un-rotated slat, foreshortened
  // toward the slat's own centre line by how face-on it currently reads.
  float vPrime = (v - 0.5) / max(absC, 0.0001) + 0.5;

  if (abs(vPrime - 0.5) > 0.5) {
    // The slat has rotated past this pixel — the page shows through the
    // gap, the way light passes between real louvres.
    o_color = vec4(u_bg.rgb, 1.0);
    return;
  }

  // A little horizontal shrink sells the turn as three-dimensional rather
  // than a flat vertical squash.
  float shrink = 1.0 - PERSPECTIVE * sin(angle);
  float u = (v_uv.x - 0.5) / max(shrink, 0.0001) + 0.5;

  vec3 color;
  if (angle < HALF_PI) {
    // Front face: still the outgoing panel.
    color = sampleOver(u_prev, vec2(u, (s + vPrime) / slats));
  } else {
    // Back face: the incoming panel, pre-mirrored so a full turn lands
    // upright — sampled at the same un-rotated v' as the front face.
    vec2 uv = vec2(u, (s + vPrime) / slats);
    color = u_newReady > 0.5 ? sampleOver(u_tex, uv) : sampleOver(u_prev, uv);
  }

  // Edge-on catches less light than face-on.
  color *= 0.55 + 0.45 * absC;

  // A thin dark line at the slat's own hinge — its centre line, where a
  // real louvre's pivot rod would sit.
  float hinge = 1.0 - smoothstep(0.0, HINGE_WIDTH, abs(v - 0.5));
  color = mix(color, color * (1.0 - HINGE_DARK), hinge);

  o_color = vec4(color, 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across flips) so the outgoing panel survives the DOM switch. */
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

/** Walks up from the host to the first opaque background colour, so a
 * transparent texture region composites onto the real page rather than onto
 * black. Mirrors glyph-sweep's and crystal-lens's own copy. */
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

type LouvreLayerProps = Required<
  Pick<LouvreFlipProps, "index" | "slats" | "duration" | "stagger">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, and the frame loop; reads everything else from the surface.
 * `index` is the only trigger for a flip — no idle ticking between them.
 */
function LouvreLayer({
  index,
  slats,
  duration,
  stagger,
  background,
}: LouvreLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // flips, and the correct value before any flip has ever run.
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
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const prevIndexRef = React.useRef(index);
  const flipControlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a flip starts until the painter lands a version newer than
  // the one in force when it started.
  const newReadyRef = React.useRef(true);
  const flipStartVersionRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ slats, stagger });
  React.useEffect(() => {
    paramsRef.current = { slats, stagger };
  });

  // One frame: upload whatever textures landed since the last draw, then
  // composite the outgoing slats, the flipping band, and the incoming
  // slats in a single pass.
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

    if (!newReadyRef.current && live.version > flipStartVersionRef.current) {
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
    // Before the first flip nothing has been retained yet. Falling back to
    // the current texture is harmless — at progress 1 the shader never
    // actually samples u_prev.
    const prevTexture = prevTextureRef.current ?? texture;

    resizeGL(gl, canvas, { dprCap: 2 });
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_prev", prevTexture, 0);
    program.texture("u_tex", texture, 1);
    program.set({
      u_progress: progress.get(),
      u_slats: p.slats,
      u_stagger: p.stagger,
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

  // The flip's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between flips.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent, or
  // where a slat's gap opens onto the page beneath it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The flip trigger: retain the outgoing frame the moment `index` changes,
  // then run `progress` 0 → 1. A layout effect so the retain runs
  // synchronously against the pre-swap paint, in the same tick React
  // committed the new panel — before the painter has had a chance to
  // repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    flipControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no flip to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    flipStartVersionRef.current = live.version;

    progress.jump(0);
    flipControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the flip finishes, but if it somehow
        // has not, stop waiting on it rather than hold the far slats on
        // stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A flip in flight must not outlive the component.
  React.useEffect(
    () => () => {
      flipControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="louvre-flip"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels built from horizontal slats, each pivoting on
 * its own centre line like a venetian blind's tilt rod. Change `index` and
 * the slats flip in a shallow cascade, top slat first, each one starting
 * `stagger` of the duration after the one above it: the outgoing panel
 * foreshortens toward each slat's hinge, the gap opens onto the page
 * background as the slat turns edge-on, and the incoming panel sets in on
 * the far side. Only the active panel ever renders into the painted DOM —
 * the outgoing texture is retained into its own canvas the instant `index`
 * changes, before the painter has redrawn anything, so the flip never waits
 * on a paint to start.
 * Reduced motion: panels switch instantly with no flip, and this layer
 * renders nothing — the real DOM shows the active panel directly.
 */
export function LouvreFlip({
  index,
  slats = 9,
  duration = 1.1,
  stagger = 0.06,
  background,
  paint,
  className,
  children,
}: LouvreFlipProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <LouvreLayer
          index={activeIndex}
          slats={slats}
          duration={duration}
          stagger={stagger}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
