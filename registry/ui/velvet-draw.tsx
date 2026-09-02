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

export type VelvetDrawProps = {
  /** Which panel is active. Changing it retains the outgoing frame, draws the curtains shut over it, swaps the texture behind them, then opens onto the panel at this index. */
  index: number;
  /** Seconds for the whole close–hold–open cycle. @default 1.6 */
  duration?: number;
  /** Velvet colour. CSS; resolved with `resolveColor`. @default "#7f1d1d" */
  color?: string;
  /** Fold count spanning a fully-closed curtain (half the surface width). @default 9 */
  folds?: number;
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
uniform float u_folds;
uniform float u_tick;
uniform vec3 u_color;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

const float PI = 3.14159265;
const float TWO_PI = 6.28318530718;
// Where a curtain's gathered pleats compress toward its inner (centre) edge.
const float GATHER_REACH = 60.0;
// Hem band height at the bottom of a curtain, in CSS px.
const float HEM_HEIGHT = 24.0;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Shades one curtain at px: a sine fold pattern lit by a diffuse term
// (dark valleys, a light sheen at the crests), gathered — higher fold
// frequency — near its inner edge, with a scalloped hem darkening the
// bottom HEM_HEIGHT px.
vec3 curtainShade(vec2 px, float innerDist, float halfW, float tick, float foldCount, vec3 velvet) {
  float gather = mix(1.6, 1.0, smoothstep(0.0, GATHER_REACH, innerDist));
  float freq = foldCount * gather;
  float wave = 0.5 + 0.5 * sin(px.x * freq * TWO_PI / halfW + tick * 3.0 * 0.05);
  float diffuse = mix(0.55, 1.0, wave);
  float sheen = smoothstep(0.75, 1.0, wave) * 0.25;
  vec3 shaded = velvet * diffuse + vec3(sheen);

  float scallop = abs(sin(px.x * foldCount * PI / halfW)) * 8.0;
  float hemLine = (u_res.y - HEM_HEIGHT) - scallop;
  float hemT = smoothstep(hemLine - 2.0, hemLine + 2.0, px.y);
  return mix(shaded, shaded * 0.6, hemT);
}

void main() {
  vec2 px = v_uv * u_res;
  float halfWidth = max(u_res.x * 0.5, 1.0);

  // Multi-phase progress: 0..0.45 close, 0.45..0.55 hold shut, 0.55..1 open.
  // closeAmount is how far each curtain has travelled from the wall (0)
  // toward the centre seam (1) regardless of which half of the cycle it is.
  float closeAmount;
  if (u_progress <= 0.45) {
    closeAmount = u_progress / 0.45;
  } else if (u_progress >= 0.55) {
    closeAmount = (1.0 - u_progress) / 0.45;
  } else {
    closeAmount = 1.0;
  }
  closeAmount = clamp(closeAmount, 0.0, 1.0);

  // Scaled by closeAmount too, not just the moving flag: at rest (progress
  // 0 or 1, closeAmount 0) there is no curtain edge on screen at all, and a
  // stale u_tick from the last draw must not conjure a phantom sliver.
  float moving = (u_progress < 0.45 || u_progress > 0.55) ? 1.0 : 0.0;
  float sway = sin(u_tick * 3.0) * 4.0 * moving * closeAmount;
  float edgeX = clamp(closeAmount * halfWidth + sway, 0.0, halfWidth);
  float leftEdge = edgeX;
  float rightStart = u_res.x - edgeX;

  float aa = 1.5;
  float inLeft = 1.0 - smoothstep(leftEdge - aa, leftEdge + aa, px.x);
  float inRight = smoothstep(rightStart - aa, rightStart + aa, px.x);
  float coverageRaw = inLeft + inRight;
  float coverage = clamp(coverageRaw, 0.0, 1.0);

  // What shows behind the curtains: the outgoing panel until halfway
  // through the cycle, the incoming one from there on (falling back to the
  // outgoing texture if the incoming paint hasn't landed yet).
  vec3 behind = u_progress < 0.5
    ? sampleOver(u_prev, px / u_res)
    : (u_newReady > 0.5 ? sampleOver(u_tex, px / u_res) : sampleOver(u_prev, px / u_res));

  vec3 curtain = vec3(0.0);
  if (coverageRaw > 0.0001) {
    vec3 leftColor = curtainShade(px, leftEdge - px.x, halfWidth, u_tick, u_folds, u_color);
    vec3 rightColor = curtainShade(px, px.x - rightStart, halfWidth, u_tick, u_folds, u_color);
    curtain = (leftColor * inLeft + rightColor * inRight) / coverageRaw;
  }

  o_color = vec4(mix(behind, curtain, coverage), 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across draws) so the outgoing panel survives the DOM switch. */
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

type CurtainLayerProps = Required<
  Pick<VelvetDrawProps, "index" | "duration" | "color" | "folds">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, and the frame loop; reads everything else from the surface.
 * `index` is the only trigger for a draw — no idle ticking between them.
 */
function CurtainLayer({
  index,
  duration,
  color,
  folds,
  background,
}: CurtainLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled and open on the incoming panel — the steady state
  // between draws, and the correct value before any draw has ever run.
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
  const sweepControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a draw starts until the painter lands a version newer than
  // the one in force when it started.
  const newReadyRef = React.useRef(true);
  const sweepStartVersionRef = React.useRef(0);
  // Elapsed seconds since the current draw began, from the rAF timestamp —
  // never Date.now/performance.now. Reset per draw so the fold drift and
  // sway restart cleanly each time; frozen (and unused) between draws.
  const tickStartRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ folds });
  React.useEffect(() => {
    paramsRef.current = { folds };
  });

  // One frame: advance the tick from the rAF timestamp, upload whatever
  // textures landed since the last draw, then composite outgoing panel,
  // curtains, and incoming panel in a single pass.
  const drawFrame = React.useCallback(
    (now: number) => {
      frameRef.current = null;
      const gl = glRef.current;
      const program = programRef.current;
      const tri = triRef.current;
      const canvas = canvasRef.current;
      const live = surfaceRef.current;
      if (!gl || !program || !tri || !canvas || !live.canvas) return;
      if (gl.isContextLost()) return;

      const tickStart = tickStartRef.current ?? now;
      tickStartRef.current = tickStart;
      tickRef.current = (now - tickStart) / 1000;

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
      // Before the first draw nothing has been retained yet. Falling back
      // to the current texture is harmless — at progress 1 the shader never
      // actually samples u_prev.
      const prevTexture = prevTextureRef.current ?? texture;

      const size = resizeGL(gl, canvas, { dprCap: 2 });
      const cssW = size.width / size.dpr;
      const cssH = size.height / size.dpr;
      const bg = bgRef.current;
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_prev", prevTexture, 0);
      program.texture("u_tex", texture, 1);
      program.set({
        u_res: [cssW, cssH],
        u_progress: progress.get(),
        u_folds: paramsRef.current.folds,
        u_tick: tickRef.current,
        u_color: [
          colorRgbRef.current[0],
          colorRgbRef.current[1],
          colorRgbRef.current[2],
        ],
        u_bg: bg,
        u_newReady: newReadyRef.current ? 1 : 0,
      });
      tri.draw();
    },
    [progress],
  );

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

  // The draw's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between draws.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the velvet colour through the real cascade — a token needs the
  // host's own theme scope, not the document root's.
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

  // The draw trigger: retain the outgoing frame the moment `index` changes,
  // then run `progress` 0 → 1 through the close–hold–open cycle. A layout
  // effect so the retain runs synchronously against the pre-swap paint, in
  // the same tick React committed the new panel — before the painter has
  // had a chance to repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    sweepControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land open on the incoming panel
      // with no curtain draw to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    sweepStartVersionRef.current = live.version;
    tickStartRef.current = null;

    progress.jump(0);
    sweepControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the curtains open, but if it somehow
        // has not, stop waiting on it rather than hold the curtains on
        // stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A draw in flight must not outlive the component.
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
      data-effect-canvas="velvet-draw"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels staged as theatre curtains: change `index`
 * and two velvet drapes gather in from the sides, meet at the centre seam,
 * hold shut just long enough to swap the set behind them, then open onto
 * the incoming panel. The fold pattern is one sine wave read straight off
 * each pixel's position and the time since the draw began — no cloth
 * simulation, no randomness — lit by a diffuse term that darkens the
 * valleys and a thin sheen at the crests, gathered tighter near the seam
 * and swaying gently while the curtains are actually moving. Only the
 * active panel ever renders into the painted DOM; the outgoing texture is
 * retained into its own canvas the instant `index` changes, before the
 * painter has redrawn anything, so the curtains never wait on a paint to
 * start closing.
 * Reduced motion: panels switch instantly with no curtain draw, and this
 * layer renders nothing — the real DOM shows the active panel directly.
 */
export function VelvetDraw({
  index,
  duration = 1.6,
  color = "#7f1d1d",
  folds = 9,
  background,
  paint,
  className,
  children,
}: VelvetDrawProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <CurtainLayer
          index={activeIndex}
          duration={duration}
          color={color}
          folds={folds}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
