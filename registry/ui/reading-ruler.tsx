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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type ReadingRulerProps = {
  /** Fixed band height in CSS pixels. 0 measures the line box under the pointer instead. @default 0 */
  height?: number;
  /** Feather above and below the band, in CSS pixels. @default 18 */
  softness?: number;
  /** How far the blurred surround mixes toward the background (0..1). @default 0.35 */
  dim?: number;
  /** Blur strength outside the band — scales a five-tap cross sample. @default 1 */
  blur?: number;
  /** Tint washed at 6% opacity inside the band, any CSS colour. @default "var(--warn)" */
  tint?: string;
  /** Locate the line box under the pointer via elementFromPoint + getClientRects and lock the band to it. Off just follows the raw pointer y at a fixed height. @default true */
  snap?: boolean;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_center;
uniform float u_half;
uniform float u_softness;
uniform float u_dim;
uniform float u_blur;
uniform vec3 u_tint;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 uv = v_uv;

  // A cheap five-tap cross: the centre sample plus one step up, down, left
  // and right, weighted toward the centre. Not a real convolution, just
  // enough softening that the surround reads as out of focus.
  float step = max(u_blur, 0.0) * 3.0;
  vec2 dx = vec2(step / u_res.x, 0.0);
  vec2 dy = vec2(0.0, step / u_res.y);
  vec3 blurred =
    sampleOver(uv) * 0.36 +
    sampleOver(uv + dx) * 0.16 +
    sampleOver(uv - dx) * 0.16 +
    sampleOver(uv + dy) * 0.16 +
    sampleOver(uv - dy) * 0.16;

  vec3 outside = mix(blurred, u_bg.rgb, clamp(u_dim, 0.0, 1.0));

  float half_ = max(u_half, 0.0);
  float soft = max(u_softness, 0.001);
  float dist = abs(px.y - u_center);
  float t = smoothstep(half_, half_ + soft, dist);

  // Inside the band the real DOM shows through untouched (overlay mode) —
  // this pass only adds a faint tint. Outside it, the softened, dimmed
  // texture covers the DOM at full opacity.
  vec3 color = mix(u_tint, outside, t);
  float alpha = mix(0.06, 1.0, t);
  o_color = vec4(color, alpha);
}
`;

type RulerLayerProps = Required<
  Pick<
    ReadingRulerProps,
    "height" | "softness" | "dim" | "blur" | "tint" | "snap"
  >
>;

/** Half-height sentinel for "the band is open": larger than any surface, so
 * every pixel falls inside it and nothing is dimmed. Used both as the
 * resting default (before the first hover) and the pointer-leave target. */
const OPEN_HALF = 100000;

/** Half the assumed line height when `snap` can't find a real line box
 * (snap off, or an empty element under the pointer) and `height` is 0. */
const FALLBACK_LINE_HEIGHT = 28;

type LineTarget = { centerY: number; targetHalf: number };

/** Walks up from the host to the first opaque background colour, so blur
 * samples over transparent texture regions composite onto the page rather
 * than onto black — the same idiom `crystal-lens.tsx` uses. */
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

/** The element under the viewport point, and the rect of whichever of its
 * client rects the point actually falls in — an inline element wrapped
 * across several lines reports one rect per line, so this picks the line
 * fragment under the pointer rather than the element's full bounding box.
 * Falls back to the bounding rect when no rect contains the point. */
function findLineBox(clientX: number, clientY: number): DOMRect | null {
  let el: Element | null;
  try {
    el = document.elementFromPoint(clientX, clientY);
  } catch {
    return null;
  }
  if (!el) return null;
  try {
    const rects = el.getClientRects();
    for (const rect of Array.from(rects)) {
      if (clientY >= rect.top && clientY <= rect.bottom) return rect;
    }
    const first = rects[0];
    if (first) return first;
  } catch {
    /* fall through to the bounding rect */
  }
  try {
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

/**
 * The GL layer. Owns the context, the program, the texture, the band's
 * motion values, and the frame loop; reads everything else from the
 * surface.
 */
function RulerLayer({
  height,
  softness,
  dim,
  blur,
  tint,
  snap,
}: RulerLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const y = useMotionValue<number>(0);
  const half = useMotionValue<number>(OPEN_HALF);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const tintRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ height, softness, dim, blur, snap });
  React.useEffect(() => {
    paramsRef.current = { height, softness, dim, blur, snap };
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_center: y.get(),
      u_half: half.get(),
      u_softness: p.softness,
      u_dim: p.dim,
      u_blur: p.blur,
      u_tint: tintRef.current,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [y, half]);

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
    // pointer move.
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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [y, half].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [y, half, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: resolve the band's target from either the located
  // line box (snap) or the raw pointer, spring the centre, and open the
  // band back up on leave so nothing stays dimmed.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    const tintRgba = resolveColor(tint, host);
    tintRef.current = [tintRgba[0], tintRgba[1], tintRgba[2]];

    const resolveTarget = (
      clientX: number,
      clientY: number,
      hostRect: DOMRect,
    ): LineTarget => {
      const p = paramsRef.current;
      let centerY = clientY - hostRect.top;
      let measuredHeight: number | null = null;
      if (p.snap) {
        const box = findLineBox(clientX, clientY);
        if (box) {
          centerY = box.top + box.height / 2 - hostRect.top;
          measuredHeight = box.height;
        }
      }
      const targetHalf =
        (p.height > 0 ? p.height : (measuredHeight ?? FALLBACK_LINE_HEIGHT)) /
        2;
      return { centerY, targetHalf };
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const target = resolveTarget(event.clientX, event.clientY, rect);
      if (!surfaceRef.current.motionSafe) {
        y.set(target.centerY);
        half.set(target.targetHalf);
      } else {
        animate(y, target.centerY, springs.snap);
        animate(half, target.targetHalf, springs.glide);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const target = resolveTarget(event.clientX, event.clientY, rect);
      y.jump(target.centerY);
      half.jump(target.targetHalf);
    };
    const leave = () => {
      if (!surfaceRef.current.motionSafe) half.set(OPEN_HALF);
      else animate(half, OPEN_HALF, springs.glide);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, tint, y, half]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="reading-ruler"
      className="block h-full w-full"
    />
  );
}

/**
 * A horizontal band that follows the cursor like a straightedge laid over
 * the page: inside it the interface is the real, untouched DOM plus a
 * whisper of warm tint; outside it, the painted texture is softened by a
 * cheap five-tap blur and mixed toward the surface colour by `dim`, so the
 * eye has nowhere else to land. With `snap` (the default), every pointer
 * move asks the live page — `elementFromPoint`, then the found element's
 * own `getClientRects()` — which line sits under the cursor, and the
 * band's centre and height lock to that line rather than to the raw
 * cursor position; a fixed `height` overrides the measured one, and
 * turning `snap` off just follows the pointer at that fixed height. The
 * blur is a five-sample cross, not a real convolution, and leaving the
 * page widens the band back out to the full surface rather than hiding it,
 * so nothing stays dimmed once the pointer is gone.
 * Reduced motion: the band's centre and height jump to the pointer instead
 * of springing; the blur and dim outside it are unchanged.
 */
export function ReadingRuler({
  height = 0,
  softness = 18,
  dim = 0.35,
  blur = 1,
  tint = "var(--warn)",
  snap = true,
  paint,
  className,
  children,
}: ReadingRulerProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <RulerLayer
          height={height}
          softness={softness}
          dim={dim}
          blur={blur}
          tint={tint}
          snap={snap}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
