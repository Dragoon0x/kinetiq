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
// evaluation — the same guard glyph-sweep.tsx uses for its own.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type IrisBladesProps = {
  /** Which panel is active. Changing it retains the outgoing frame, closes the iris over it, then reopens on the panel at this index. */
  index: number;
  /** Number of blade sides the aperture's polygon has. @default 7 */
  blades?: number;
  /** Full close-then-reopen duration, in seconds. @default 1.2 */
  duration?: number;
  /** Aperture centre, as a fraction of the surface's width and height. @default [0.5, 0.5] */
  center?: [number, number];
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
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_progress;
uniform vec2 u_center;
uniform float u_blades;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
// #2b2f36 — the blade's own base colour, sRGB 0..1.
const vec3 BLADE_BASE = vec3(0.1686, 0.1843, 0.2118);
const vec3 EDGE_GLOW = vec3(0.85, 0.88, 0.92);

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 centerPx = u_center * u_res;
  vec2 delta = px - centerPx;
  float dist = length(delta);

  // maxR covers the far corner from centre, so a fully open aperture
  // (r == maxR) always spans the whole surface no matter where centre sits.
  float toTL = length(vec2(0.0, 0.0) - centerPx);
  float toTR = length(vec2(u_res.x, 0.0) - centerPx);
  float toBL = length(vec2(0.0, u_res.y) - centerPx);
  float toBR = length(u_res - centerPx);
  float maxR = max(max(toTL, toTR), max(toBL, toBR));

  // Open at progress 0, closed at 0.5, open again at 1 — a mechanical iris
  // that shuts over the outgoing panel and reopens on the incoming one.
  float r = maxR * (1.0 - sin(u_progress * PI));

  float rotation = u_progress * 0.6;
  float angle = atan(delta.y, delta.x) - rotation;
  float sector = TWO_PI / u_blades;
  float halfSector = PI / u_blades;
  float angleMod = mod(angle, sector);
  float d = cos(halfSector) * dist / cos(angleMod - halfSector);

  vec3 oldColor = sampleOver(u_prev, px / u_res);
  vec3 newColor = u_newReady > 0.5 ? sampleOver(u_tex, px / u_res) : oldColor;
  vec3 panelColor = u_progress < 0.5 ? oldColor : newColor;

  // Brushed-metal blade: a dark base, thin concentric brush lines, a
  // per-blade facet gradient standing in for angled light on each leaf, and
  // a bright edge right where the aperture meets the metal.
  float brushed = sin(dist * 1.8) * 0.05;
  float facetT = angleMod / sector;
  float facet = mix(-0.04, 0.06, facetT);
  vec3 metal = BLADE_BASE + vec3(brushed + facet);
  float edgeDist = abs(d - r);
  float edgeGlow = 1.0 - smoothstep(0.0, 2.0, edgeDist);
  metal = mix(metal, EDGE_GLOW, edgeGlow * 0.85);

  float insideT = 1.0 - smoothstep(-1.5, 1.5, d - r);
  o_color = vec4(mix(metal, panelColor, insideT), 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across sweeps) so the outgoing panel survives the DOM switch. */
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

type ApertureLayerProps = Required<
  Pick<IrisBladesProps, "index" | "blades" | "duration" | "center">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, and the frame loop; reads everything else from the surface.
 * `index` is the only trigger for a close-and-reopen — no idle ticking
 * between them.
 */
function ApertureLayer({
  index,
  blades,
  duration,
  center,
  background,
}: ApertureLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel, aperture open — the steady
  // state between transitions, and the correct value before any transition
  // has ever run.
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
  const sweepControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a transition starts until the painter lands a version newer
  // than the one in force when it started.
  const newReadyRef = React.useRef(true);
  const sweepStartVersionRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });

  const paramsRef = React.useRef({ blades, center });
  React.useEffect(() => {
    paramsRef.current = { blades, center };
  });

  // One frame: upload whatever textures landed since the last draw, then
  // composite the outgoing texture, the blade metal, and the incoming
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
    // Before the first transition nothing has been retained yet. Falling
    // back to the current texture is harmless — at progress 1 the shader
    // never actually samples u_prev.
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
      u_center: p.center,
      u_blades: p.blades,
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

  // The transition's own progress and every completed paint ask for a
  // frame — nothing else does, so the loop is silent between transitions.
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

  // The transition trigger: retain the outgoing frame the moment `index`
  // changes, then run `progress` 0 → 1 (aperture closes, then reopens). A
  // layout effect so the retain runs synchronously against the pre-swap
  // paint, in the same tick React committed the new panel — before the
  // painter has had a chance to repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    sweepControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no transition to run.
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
        // incoming panel well before the aperture reopens, but if it
        // somehow has not, stop waiting on it rather than hold the open
        // iris on stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A transition in flight must not outlive the component.
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
      data-effect-canvas="iris-blades"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels: change `index` and a mechanical iris — a
 * regular polygon built from `blades` sides — closes over the outgoing
 * panel and reopens on the one at the new index, rotating a little as it
 * goes. The blade boundary is worked out per pixel from its angle and
 * distance to `center`, the same angle-to-edge trick a lens diaphragm
 * uses, and the metal's shading (brush lines, a per-blade facet, a bright
 * edge at the aperture's rim) is a fixed function of that same geometry,
 * never a texture. Only the active panel ever renders into the painted
 * DOM — the outgoing frame is retained into its own canvas the instant
 * `index` changes, before the painter has redrawn anything, and the
 * incoming panel only takes over once its own paint has actually landed.
 * Reduced motion: this layer renders nothing; the real DOM shows the
 * active panel directly with an instant swap.
 */
export function IrisBlades({
  index,
  blades = 7,
  duration = 1.2,
  center = [0.5, 0.5],
  background,
  paint,
  className,
  children,
}: IrisBladesProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <ApertureLayer
          index={activeIndex}
          blades={blades}
          duration={duration}
          center={center}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
