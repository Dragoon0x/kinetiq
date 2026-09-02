"use client";

import * as React from "react";

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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type MarkerDragProps = {
  /** Highlighter colour, resolved with resolveColor (tokens included). @default "#fde047" */
  color?: string;
  /** Stroke thickness in CSS pixels, used only when no text line box is found under the pointer (snap off, or nothing textual there). @default 22 */
  width?: number;
  /** Opacity of the composited mark over the page (0..1). @default 0.6 */
  opacity?: number;
  /** Lock each stroked segment's y and thickness to the text line box under the pointer instead of the raw pointer position and `width`. @default true */
  snap?: boolean;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_page;
uniform sampler2D u_stroke;
uniform vec3 u_color;
uniform float u_opacity;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

void main() {
  // Coverage from the offscreen stroke board — its colour channels are
  // never read, only alpha, since the mark's colour comes from multiplying
  // u_color against the live page below.
  float s = texture(u_stroke, v_uv).a;
  if (s <= 0.0) {
    o_color = vec4(0.0);
    return;
  }
  vec4 pageSample = texture(u_page, v_uv);
  vec3 page = mix(u_bg.rgb, pageSample.rgb, pageSample.a);
  vec3 marked = u_color * page;
  o_color = vec4(marked, s * clamp(u_opacity, 0.0, 1.0));
}
`;

/** Walks up from the host to the first opaque background colour, so page
 * samples over transparent texture regions composite onto the page rather
 * than onto black — the same idiom crystal-lens.tsx and reading-ruler.tsx
 * use. */
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

type StrokePoint = { x: number; y: number; height: number };

/** The line-box rect under (clientX, clientY): elementFromPoint finds the
 * innermost element, then a Range over each of its descendant text nodes
 * reports one client rect per visual line — the same per-line fragments the
 * DOM painter itself reads text from — and the first rect spanning the
 * pointer's y wins. Null when nothing textual sits under the point. */
function findTextLineBox(clientX: number, clientY: number): DOMRect | null {
  let el: Element | null;
  try {
    el = document.elementFromPoint(clientX, clientY);
  } catch {
    return null;
  }
  if (!el) return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (text.data.trim().length > 0) {
      try {
        const range = document.createRange();
        range.selectNodeContents(text);
        const rects = range.getClientRects();
        for (const rect of Array.from(rects)) {
          if (clientY >= rect.top && clientY <= rect.bottom) return rect;
        }
      } catch {
        // An unrenderable text node (a detached range) — try the next one.
      }
    }
    node = walker.nextNode();
  }
  return null;
}

/** Where one segment endpoint lands and how thick the highlighter is there.
 * With snap on, both come from `findTextLineBox` — the rect's vertical
 * centre and height, converted to host-relative CSS px. No line box (an
 * image, a gap, snap itself off) falls back to the raw pointer position and
 * the fixed `width` prop — free drawing. */
function resolveStrokePoint(
  clientX: number,
  clientY: number,
  hostRect: DOMRect,
  snap: boolean,
  fallbackWidth: number,
): StrokePoint {
  const x = clientX - hostRect.left;
  if (snap) {
    const box = findTextLineBox(clientX, clientY);
    if (box) {
      return {
        x,
        y: box.top + box.height / 2 - hostRect.top,
        height: Math.max(box.height, 1),
      };
    }
  }
  return { x, y: clientY - hostRect.top, height: Math.max(fallbackWidth, 1) };
}

/** Deterministic, seeded on the segment's own running index — never
 * Math.random — so a given drag always wobbles the same way. */
const JITTER_STEP = 0.85;
const JITTER_AMPLITUDE = 1.5;
function jitterFor(segmentIndex: number): number {
  return Math.sin(segmentIndex * JITTER_STEP) * JITTER_AMPLITUDE;
}

/** Redraws the stroke in progress as ONE path over a snapshot of the board
 * taken when the drag began: a single stroke call means the round joins
 * never double up into beads, while marks from earlier drags (already in
 * the snapshot) still darken where this one crosses them. */
function restrokeMarkerPath(
  ctx: CanvasRenderingContext2D,
  snapshot: HTMLCanvasElement | null,
  points: readonly StrokePoint[],
  color: [number, number, number, number],
  still: boolean,
): void {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (snapshot) ctx.drawImage(snapshot, 0, 0);
  ctx.restore();
  const last = points[points.length - 1];
  if (points.length < 2 || !last) return;
  const r = Math.round(color[0] * 255);
  const g = Math.round(color[1] * 255);
  const b = Math.round(color[2] * 255);
  ctx.save();
  ctx.globalAlpha = 0.35 * color[3];
  ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(last.height, 1);
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (!pt) continue;
    const jitter = still ? 0 : jitterFor(i);
    if (i === 0) ctx.moveTo(pt.x, pt.y + jitter);
    else ctx.lineTo(pt.x, pt.y + jitter);
  }
  ctx.stroke();
  ctx.restore();
}

/** Copies the board as it stands, so a stroke in progress can be redrawn
 * over it from scratch on every move. */
function snapshotBoard(board: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = board.width;
  copy.height = board.height;
  copy.getContext("2d")?.drawImage(board, 0, 0);
  return copy;
}

/** Full clear — every mark gone, no residue. */
function clearMarkerBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
}

type MarkerDragLayerProps = Required<
  Pick<MarkerDragProps, "color" | "width" | "opacity" | "snap">
>;

/**
 * The GL layer. Owns the context, the program, the two textures (the live
 * page and the offscreen stroke board), the drag tracking, and a
 * frame-per-event draw; reads everything else from the surface.
 */
function MarkerDragLayer({
  color,
  width,
  opacity,
  snap,
}: MarkerDragLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  // The live page: the surface's own painted canvas, re-uploaded whenever
  // its version bumps — the same idiom as crystal-lens's texture.
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);

  // The stroke board: an offscreen 2D canvas at the GL canvas's own
  // device-pixel resolution, recreated (which wipes every mark) whenever
  // that resolution changes — the same idiom as chalk-dust's stroke canvas.
  const strokeCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const strokeCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const strokeSizeRef = React.useRef({ width: 0, height: 0 });
  const strokeTextureRef = React.useRef<WebGLTexture | null>(null);
  const strokeVersionRef = React.useRef(0);
  const strokeUploadedVersionRef = React.useRef(0);

  const colorRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);

  const segmentIndexRef = React.useRef(0);
  const lastDrawnPointRef = React.useRef<StrokePoint | null>(null);
  const strokePointsRef = React.useRef<StrokePoint[]>([]);
  const snapshotRef = React.useRef<HTMLCanvasElement | null>(null);
  const lastRawRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const capturedRef = React.useRef(false);
  const isDraggingRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ width, opacity, snap });
  React.useEffect(() => {
    paramsRef.current = { width, opacity, snap };
  });

  // One frame: (re)size the stroke board to match the GL canvas's own
  // backing store, re-upload whichever texture changed, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas || !live.canvas) return;
    if (gl.isContextLost()) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    strokeSizeRef.current = {
      width: size.width / size.dpr,
      height: size.height / size.dpr,
    };

    let stroke = strokeCanvasRef.current;
    if (!stroke) {
      stroke = document.createElement("canvas");
      strokeCanvasRef.current = stroke;
    }
    if (stroke.width !== size.width || stroke.height !== size.height) {
      stroke.width = size.width;
      stroke.height = size.height;
      const sctx = stroke.getContext("2d");
      strokeCtxRef.current = sctx;
      // A fresh backing store also resets the 2D context's own transform —
      // reapply it so every draw call stays in CSS-pixel space.
      if (sctx) sctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      lastDrawnPointRef.current = null;
      lastRawRef.current = null;
      strokeVersionRef.current += 1;
    }

    if (uploadedVersionRef.current !== live.version) {
      textureRef.current = uploadTexture(
        gl,
        live.canvas,
        { linear: true, wrap: "clamp" },
        textureRef.current,
      );
      uploadedVersionRef.current = live.version;
    }
    if (strokeUploadedVersionRef.current !== strokeVersionRef.current) {
      strokeTextureRef.current = uploadTexture(
        gl,
        stroke,
        { linear: true, wrap: "clamp" },
        strokeTextureRef.current,
      );
      strokeUploadedVersionRef.current = strokeVersionRef.current;
    }
    const pageTexture = textureRef.current;
    const strokeTexture = strokeTextureRef.current;
    if (!pageTexture || !strokeTexture) return;

    const c = colorRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_page", pageTexture, 0);
    program.texture("u_stroke", strokeTexture, 1);
    program.set({
      u_color: [c[0], c[1], c[2]],
      u_opacity: paramsRef.current.opacity,
      u_bg: bgRef.current,
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
    strokeUploadedVersionRef.current = 0;
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
    // Draw the (empty) board immediately rather than waiting for a drag.
    requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (strokeTextureRef.current) gl.deleteTexture(strokeTextureRef.current);
      strokeTextureRef.current = null;
      strokeUploadedVersionRef.current = 0;
      strokeCanvasRef.current = null;
      strokeCtxRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Colour is resolved against the host so `var(--token)` reads the theme
  // that actually applies to it — re-resolved whenever the prop changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // `opacity` is a shader uniform, not baked into the stroke board, so a
  // change must repaint the already-drawn marks even without a new drag.
  React.useEffect(() => {
    requestFrame();
  }, [opacity, requestFrame]);

  // Pointer + double-click on the host: pointerdown only records the point
  // and defers capture until the drag clears 4px of real pointer travel —
  // the chalk-dust idiom — so a plain click still reaches a control
  // underneath. Every qualifying move strokes one segment straight onto the
  // board and bumps its version; double-click clears it outright.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      pointerIdRef.current = event.pointerId;
      isDraggingRef.current = true;
      capturedRef.current = false;
      lastRawRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      lastDrawnPointRef.current = resolveStrokePoint(
        event.clientX,
        event.clientY,
        rect,
        paramsRef.current.snap,
        paramsRef.current.width,
      );
      const board = strokeCanvasRef.current;
      snapshotRef.current = board ? snapshotBoard(board) : null;
      strokePointsRef.current = lastDrawnPointRef.current
        ? [lastDrawnPointRef.current]
        : [];
    };

    const move = (event: PointerEvent) => {
      if (!isDraggingRef.current || pointerIdRef.current !== event.pointerId) {
        return;
      }
      const rect = host.getBoundingClientRect();
      const rawX = event.clientX - rect.left;
      const rawY = event.clientY - rect.top;
      const lastRaw = lastRawRef.current;

      if (
        !capturedRef.current &&
        lastRaw &&
        Math.hypot(rawX - lastRaw.x, rawY - lastRaw.y) > 4
      ) {
        host.setPointerCapture(event.pointerId);
        capturedRef.current = true;
      }

      const point = resolveStrokePoint(
        event.clientX,
        event.clientY,
        rect,
        paramsRef.current.snap,
        paramsRef.current.width,
      );
      const ctx = strokeCtxRef.current;
      const from = lastDrawnPointRef.current;
      if (ctx && from) {
        strokePointsRef.current = [...strokePointsRef.current, point];
        restrokeMarkerPath(
          ctx,
          snapshotRef.current,
          strokePointsRef.current,
          colorRef.current,
          !surfaceRef.current.motionSafe,
        );
        segmentIndexRef.current += 1;
        strokeVersionRef.current += 1;
      }
      lastDrawnPointRef.current = point;
      lastRawRef.current = { x: rawX, y: rawY };
      requestFrame();
    };

    const endDrag = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      if (capturedRef.current) {
        try {
          host.releasePointerCapture(event.pointerId);
        } catch {
          // Capture may already be gone — nothing to clean up.
        }
      }
      capturedRef.current = false;
      pointerIdRef.current = null;
      isDraggingRef.current = false;
      lastRawRef.current = null;
      lastDrawnPointRef.current = null;
    };

    const dblclick = (event: MouseEvent) => {
      event.preventDefault();
      const ctx = strokeCtxRef.current;
      if (!ctx) return;
      const { width: w, height: h } = strokeSizeRef.current;
      clearMarkerBoard(ctx, w, h);
      strokeVersionRef.current += 1;
      requestFrame();
    };

    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", endDrag);
    host.addEventListener("pointercancel", endDrag);
    host.addEventListener("pointerleave", endDrag);
    host.addEventListener("dblclick", dblclick);
    return () => {
      if (pointerIdRef.current !== null && capturedRef.current) {
        try {
          host.releasePointerCapture(pointerIdRef.current);
        } catch {
          // Already released — nothing to clean up.
        }
      }
      pointerIdRef.current = null;
      isDraggingRef.current = false;
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", endDrag);
      host.removeEventListener("pointercancel", endDrag);
      host.removeEventListener("pointerleave", endDrag);
      host.removeEventListener("dblclick", dblclick);
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="marker-drag"
      className="block h-full w-full"
    />
  );
}

/**
 * A highlighter dragged across the live interface: an offscreen 2D board
 * tracks the stroke — round-capped, drawn only while a real drag is
 * underway, its y wobbling by a deterministic sine of the segment index so
 * the mark never reads as a ruled line — and a fragment shader multiplies
 * the highlighter colour against the painted page wherever that board has
 * coverage, so the mark darkens over text and lightens over headings the
 * way a real highlighter does. With `snap` on, every stroked segment locks
 * to the text line box under the pointer (`elementFromPoint`, then each of
 * its text nodes' own `Range.getClientRects()`) instead of the raw pointer
 * y and the fixed `width`, so a drag along a sentence lays flat rather than
 * following the mouse's own wobble; double-click clears the board. Pointer
 * capture is deferred until the drag clears 4px, so a plain click still
 * reaches a button or link underneath.
 * Reduced motion: strokes still draw — this is drawing, not motion — but no
 * jitter is added, so every segment lies straight.
 */
export function MarkerDrag({
  color = "#fde047",
  width = 22,
  opacity = 0.6,
  snap = true,
  paint,
  className,
  children,
}: MarkerDragProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-crosshair touch-none", className)}
      effect={
        <MarkerDragLayer
          color={color}
          width={width}
          opacity={opacity}
          snap={snap}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
