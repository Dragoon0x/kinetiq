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

export type TearStripProps = {
  /** Which panel is active. Changing it retains the outgoing frame and tears a strip across to the panel at this index. */
  index: number;
  /** Tear duration in seconds. @default 1.0 */
  duration?: number;
  /** Fractional height (0..1) of the perforation the tear starts from — above it the old panel never tears. @default 0.38 */
  row?: number;
  /** Raggedness of the tear front. @default 1 */
  rough?: number;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_progress;
uniform float u_row;
uniform float u_rough;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

// Perforation dash geometry, in CSS px.
const float PERF_THICKNESS = 1.0;
const float PERF_DASH = 2.0;
const float PERF_PERIOD = 6.0;
const float PERF_ALPHA = 0.16;
// The curled flap just behind the tear front, and the shadow it throws
// further ahead onto the newly revealed panel.
const float FLAP_WIDTH = 24.0;
const float SHADOW_WIDTH = 12.0;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A faint dashed line across the row: present wherever old paper still
// covers this pixel, gone the instant the tear takes it.
float perforationMask(vec2 px, float perfY) {
  float lineDist = abs(px.y - perfY);
  if (lineDist >= PERF_THICKNESS) return 0.0;
  float along = mod(px.x, PERF_PERIOD);
  return along < PERF_DASH ? PERF_ALPHA : 0.0;
}

void main() {
  vec2 px = v_uv * u_res;

  if (u_progress >= 1.0) {
    o_color = vec4(sampleOver(u_tex, px / u_res), 1.0);
    return;
  }

  float perfY = u_row * u_res.y;
  float perf = perforationMask(px, perfY);

  // Above the perforation the old panel holds, untouched, until progress
  // lands on 1 above.
  if (px.y < perfY) {
    vec3 oldAbove = sampleOver(u_prev, px / u_res);
    o_color = vec4(mix(oldAbove, vec3(0.0), perf), 1.0);
    return;
  }

  // Below it the strip peels from the left. The front is jittered per
  // scanline by a fractal noise sample so the edge reads torn, not cut.
  float front = u_progress * (u_res.x + 40.0);
  float jitter = kx_fbm(vec2(px.y * 0.05, 3.0));
  float frontRow = front + jitter * u_rough * 18.0;

  if (px.x >= frontRow) {
    vec3 oldBelow = sampleOver(u_prev, px / u_res);
    o_color = vec4(mix(oldBelow, vec3(0.0), perf), 1.0);
    return;
  }

  float behind = frontRow - px.x;

  if (behind < FLAP_WIDTH) {
    // The curled flap: the just-torn strip, still lit by the old page,
    // rolling back on itself rather than lying flat over the new one.
    float curlT = clamp(behind / FLAP_WIDTH, 0.0, 1.0);
    float curl = sin(curlT * 3.14159265) * 14.0;
    vec3 flap = sampleOver(u_prev, (px + vec2(curl, 0.0)) / u_res);
    float shade = mix(0.6, 0.88, curlT);
    o_color = vec4(flap * shade, 1.0);
    return;
  }

  vec3 newColor = u_newReady > 0.5
    ? sampleOver(u_tex, px / u_res)
    : sampleOver(u_prev, px / u_res);

  float shadowDist = behind - FLAP_WIDTH;
  if (shadowDist < SHADOW_WIDTH) {
    float shadowT = 1.0 - shadowDist / SHADOW_WIDTH;
    o_color = vec4(newColor * mix(1.0, 0.6, shadowT), 1.0);
    return;
  }

  o_color = vec4(newColor, 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across tears) so the outgoing panel survives the DOM switch. */
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

type TearStripLayerProps = Required<
  Pick<TearStripProps, "index" | "duration" | "row" | "rough">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, and the frame loop; reads everything else from the surface.
 * `index` is the only trigger for a tear — no idle ticking between them.
 */
function TearStripLayer({
  index,
  duration,
  row,
  rough,
  background,
}: TearStripLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // tears, and the correct value before any tear has ever run.
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
  const tearControlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a tear starts until the painter lands a version newer than
  // the one in force when it started.
  const newReadyRef = React.useRef(true);
  const tearStartVersionRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });

  const paramsRef = React.useRef({ row, rough });
  React.useEffect(() => {
    paramsRef.current = { row, rough };
  });

  // One frame: upload whatever textures landed since the last draw, then
  // composite the outgoing texture and the tear front in a single pass.
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

    if (!newReadyRef.current && live.version > tearStartVersionRef.current) {
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
    // Before the first tear nothing has been retained yet. Falling back to
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
      u_row: p.row,
      u_rough: p.rough,
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

  // The tear's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between tears.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The tear trigger: retain the outgoing frame the moment `index`
  // changes, then run `progress` 0 → 1. A layout effect so the retain runs
  // synchronously against the pre-swap paint, in the same tick React
  // committed the new panel — before the painter has had a chance to
  // repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    tearControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no tear to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    tearStartVersionRef.current = live.version;

    progress.jump(0);
    tearControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the tear finishes, but if it somehow
        // has not, stop waiting on it rather than hold the reveal on stale
        // pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A tear in flight must not outlive the component.
  React.useEffect(
    () => () => {
      tearControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="tear-strip"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels: change `index` and a strip tears open
 * across the old panel along a perforation, curling back to reveal the
 * panel at that index underneath. Only the paper below `row` ever tears —
 * above the perforation the old panel holds until the very last frame,
 * which is also the frame the perforation itself disappears on. The tear
 * front is one straight sweep jittered per scanline by a fractal noise
 * sample, so the edge reads torn rather than cut, and the curled sliver
 * riding just behind it drops a short shadow onto the freshly revealed
 * panel. Only the active panel ever renders into the painted DOM — the
 * outgoing texture is retained into its own canvas the instant `index`
 * changes, before the painter has redrawn anything, so the tear never
 * waits on a paint to start.
 * Reduced motion: panels switch instantly with no tear, and this layer
 * renders nothing — the real DOM shows the active panel directly.
 */
export function TearStrip({
  index,
  duration = 1.0,
  row = 0.38,
  rough = 1,
  background,
  paint,
  className,
  children,
}: TearStripProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <TearStripLayer
          index={activeIndex}
          duration={duration}
          row={row}
          rough={rough}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
