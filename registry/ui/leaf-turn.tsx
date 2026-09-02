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
import { springs } from "@/registry/lib/motion";
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

export type LeafTurnProps = {
  /** Which panel is active. Changing it retains the outgoing frame and turns a leaf across to the panel at this index. */
  index: number;
  /** Turn duration in seconds, for an `index`-driven turn. @default 1.1 */
  duration?: number;
  /** Width of the curling leaf next to the fold, in CSS pixels. @default 48 */
  curl?: number;
  /** Strength of the shadow the leaf casts onto the new panel just past the fold (0..1). @default 0.45 */
  shadow?: number;
  /** Fires once a drag past the midpoint commits, with the panel index the caller should switch to. The turn already reads as finished by the time this fires — it does not wait for `index` to update. */
  onTurn?: (index: number) => void;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

// The fold line's tilt is fixed — baked into the shader at build time as
// literal constants rather than a uniform, since nothing in this effect
// ever varies it.
const TILT_DEG = 12;
const TILT_RAD = (TILT_DEG * Math.PI) / 180;
const TAN_TILT = Math.tan(TILT_RAD);
const COS_TILT = Math.cos(TILT_RAD);

// The back of the leaf reads as paper, not as the page it belonged to.
const PAPER_BACK = "#f3f0e8";

const FRAGMENT = /* glsl */ `
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_progress;
uniform float u_curl;
uniform float u_shadow;
uniform vec3 u_paperBack;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

const float TAN_TILT = ${TAN_TILT.toFixed(6)};
const float COS_TILT = ${COS_TILT.toFixed(6)};
// How much of the leaf's back reads as plain paper versus a ghost of the
// page it belonged to.
const float LEAF_TINT = 0.8;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;

  // The tilt can leave a sliver of one corner ahead of a nominal 1.0 at
  // the far edges of a tall panel — past done is done regardless.
  if (u_progress >= 0.999) {
    vec3 settled = u_newReady > 0.5
      ? sampleOver(u_tex, px / u_res)
      : sampleOver(u_prev, px / u_res);
    o_color = vec4(settled, 1.0);
    return;
  }

  // The fold line's x position at this row: it sweeps from the right edge
  // toward the left as progress runs 0..1, tilted so the bottom corner
  // leads the top.
  float centered = px.y - u_res.y * 0.5;
  float xf = u_res.x * (1.0 - u_progress) - centered * TAN_TILT;
  float d = (px.x - xf) * COS_TILT;

  if (d < 0.0) {
    // Ahead of the fold: the leaf has not reached this pixel yet.
    o_color = vec4(sampleOver(u_prev, px / u_res), 1.0);
    return;
  }

  float curl = max(u_curl, 1.0);
  if (d < curl) {
    // Inside the curling leaf: its back, mirrored across the fold and
    // tinted toward paper, with a cylinder shade — a bright crest close to
    // the crease, falling into shadow as the curl rolls away from it.
    float mirroredX = 2.0 * xf - px.x;
    vec3 backSource = sampleOver(u_prev, vec2(mirroredX, px.y) / u_res);
    vec3 leaf = mix(backSource, u_paperBack, LEAF_TINT);

    float t = d / curl;
    float crest = smoothstep(0.0, 0.32, t) * (1.0 - smoothstep(0.32, 0.62, t));
    float trough = smoothstep(0.55, 1.0, t);
    float shade = 1.0 + crest * 0.4 - trough * 0.3;

    o_color = vec4(leaf * shade, 1.0);
    return;
  }

  // Past the leaf: the new panel, dimmed by the leaf's own cast shadow
  // just beyond the fold, fading out over another curl-width band.
  vec3 newColor = u_newReady > 0.5
    ? sampleOver(u_tex, px / u_res)
    : sampleOver(u_prev, px / u_res);
  float shadowT = clamp((d - curl) / curl, 0.0, 1.0);
  float shadowAmt = (1.0 - shadowT) * clamp(u_shadow, 0.0, 1.0);
  o_color = vec4(newColor * (1.0 - shadowAmt), 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across turns) so the outgoing leaf survives the DOM switch. Identical in spirit to glyph-sweep's own retainCopy. */
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

type LeafLayerProps = Required<
  Pick<LeafTurnProps, "index" | "duration" | "curl" | "shadow">
> & {
  background?: string;
  onTurn?: (index: number) => void;
  /** Total panel count — the layer's own guard against dragging past the last leaf. */
  count: number;
};

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, the drag state, and the frame loop; reads everything else from
 * the surface. `index` and a right-edge drag are the only triggers for a
 * turn — no idle ticking between them.
 */
function LeafLayer({
  index,
  duration,
  curl,
  shadow,
  background,
  onTurn,
  count,
}: LeafLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // turns, and the correct value before any turn has ever run.
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
  const paperBackRef = React.useRef<[number, number, number]>([
    0.952941, 0.941176, 0.909804,
  ]);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const prevIndexRef = React.useRef(index);
  const turnControlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a turn starts (by index or by drag) until the painter lands
  // a version newer than the one in force when it started.
  const newReadyRef = React.useRef(true);
  const turnStartVersionRef = React.useRef(0);
  // Set the instant a drag commit calls `onTurn`, so the index-change
  // effect that fires once the caller obliges can recognise its own
  // prediction and skip re-running the turn it already played out.
  const pendingIndexRef = React.useRef<number | null>(null);
  const dragPointerIdRef = React.useRef<number | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ curl, shadow, index, count, onTurn });
  React.useEffect(() => {
    paramsRef.current = { curl, shadow, index, count, onTurn };
  }, [curl, shadow, index, count, onTurn]);

  // One frame: upload whatever textures landed since the last draw, then
  // composite the untouched leaf, the curling band, and the new panel in a
  // single pass.
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

    if (!newReadyRef.current && live.version > turnStartVersionRef.current) {
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
    // Before the first turn nothing has been retained yet. Falling back to
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
      u_curl: p.curl,
      u_shadow: p.shadow,
      u_paperBack: paperBackRef.current,
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
    // rather than on the next index change or drag.
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

  // The turn's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between turns.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the leaf's paper-back tint once the host exists, through the
  // real cascade (a plain hex today, but resolved the same way every other
  // colour in this wing is, in case a theme ever wants to override it).
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(PAPER_BACK, host);
    paperBackRef.current = [rgba[0], rgba[1], rgba[2]];
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

  // The index trigger: retain the outgoing leaf the moment `index` changes,
  // then run `progress` 0 → 1 over `duration`. A layout effect so the
  // retain runs synchronously against the pre-swap paint, in the same tick
  // React committed the new panel — before the painter has had a chance to
  // repaint over it. Skips the drag's own prediction: a drag commit already
  // played the turn and asked the caller for this exact index, so replaying
  // it here would be a second, redundant turn.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    if (pendingIndexRef.current === index) {
      // A drag commit already predicted this exact index and is still
      // springing progress toward 1 — let that animation finish rather
      // than stopping it mid-flight and replaying the turn from scratch.
      pendingIndexRef.current = null;
      return;
    }
    pendingIndexRef.current = null;
    turnControlsRef.current?.stop();

    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no turn to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    turnStartVersionRef.current = live.version;

    progress.jump(0);
    turnControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the turn finishes, but if it somehow
        // has not, stop waiting on it rather than hold the leaf over stale
        // pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // The drag trigger: grabbing within 60px of the right edge scrubs the
  // same fold by hand — progress tracks the pointer directly, no spring lag,
  // right up until release. Listeners live on the host, never the canvas,
  // per house convention.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const EDGE_ZONE = 60;

    const scrub = (clientX: number, width: number) => {
      progress.jump(clamp(1 - clientX / width, 0, 1));
    };

    const onPointerDown = (event: PointerEvent) => {
      const live = surfaceRef.current;
      if (!live.motionSafe || !live.canvas) return;
      if (dragPointerIdRef.current !== null) return;
      const rect = host.getBoundingClientRect();
      const width = rect.width;
      if (width <= 0) return;
      const px = event.clientX - rect.left;
      if (width - px > EDGE_ZONE) return;
      const p = paramsRef.current;
      if (p.index + 1 >= p.count) return; // no next leaf to turn to

      turnControlsRef.current?.stop();
      prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
      prevCaptureIdRef.current += 1;
      newReadyRef.current = false;
      turnStartVersionRef.current = live.version;

      dragPointerIdRef.current = event.pointerId;
      host.setPointerCapture(event.pointerId);
      scrub(px, width);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      const rect = host.getBoundingClientRect();
      const width = rect.width;
      if (width <= 0) return;
      scrub(event.clientX - rect.left, width);
    };

    const settle = (event: PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      dragPointerIdRef.current = null;
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
      turnControlsRef.current?.stop();
      const settled = progress.get();
      if (settled > 0.5) {
        const next = paramsRef.current.index + 1;
        turnControlsRef.current = animate(progress, 1, springs.snap);
        pendingIndexRef.current = next;
        paramsRef.current.onTurn?.(next);
      } else {
        turnControlsRef.current = animate(progress, 0, {
          ...springs.snap,
          onComplete: () => {
            // The spring is now sitting flat (progress 0, sampling the
            // snapshot retained when the drag began). Nothing ever actually
            // changed, so silently resync to the live-tracking steady state
            // — geometrically equivalent, since a retained "old" and the
            // still-current live panel are the same pixels — rather than
            // leaving the leaf frozen on that snapshot forever.
            newReadyRef.current = true;
            progress.jump(1);
          },
        });
      }
    };

    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", settle);
    host.addEventListener("pointercancel", settle);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", settle);
      host.removeEventListener("pointercancel", settle);
      dragPointerIdRef.current = null;
    };
  }, [surface.host, progress]);

  // A turn in flight must not outlive the component.
  React.useEffect(
    () => () => {
      turnControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="leaf-turn"
      className="block h-full w-full"
    />
  );
}

/**
 * A page turning between panels, corner first. Changing `index` retains the
 * outgoing panel into its own canvas and sweeps a fold line from the right
 * edge to the left over `duration`, tilted twelve degrees so the bottom
 * corner leads. The turning leaf is the outgoing panel's own texture,
 * mirrored across the fold and tinted toward a paper back, with a cylinder
 * highlight and a cast shadow standing in for real paper rather than
 * simulating it. Grabbing within 60px of the right edge scrubs the same
 * fold by hand — release past the midpoint and it finishes the turn and
 * calls `onTurn` with the next index; release short and it springs flat.
 * Reduced motion: SurfacePaint shows the real DOM and this layer renders
 * nothing, so panels switch instantly with no fold.
 */
export function LeafTurn({
  index,
  duration = 1.1,
  curl = 48,
  shadow = 0.45,
  onTurn,
  background,
  paint,
  className,
  children,
}: LeafTurnProps) {
  const count = children.length;
  const activeIndex = count > 0 ? clamp(index, 0, count - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn("touch-none", className)}
      effect={
        <LeafLayer
          index={activeIndex}
          duration={duration}
          curl={curl}
          shadow={shadow}
          background={background}
          onTurn={onTurn}
          count={count}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
