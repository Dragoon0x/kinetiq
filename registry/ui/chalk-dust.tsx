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
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type ChalkDustProps = {
  /** Chalk stroke width, in CSS pixels. @default 5 */
  width?: number;
  /** Chalk colour, resolved with resolveColor (tokens included). @default "#f4f1ea" */
  color?: string;
  /** Per-pixel grain speckle over the drawn strokes (0..1). @default 0.6 */
  grain?: number;
  /** Dust density shed from the stroke tip while drawing — 0 disables it. @default 1 */
  dust?: number;
  /** Whether double-click smears (and a second double-click clears) the board. @default true */
  wipe?: boolean;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_stroke;
uniform vec2 u_res;
uniform vec4 u_color;
uniform float u_grain;
uniform float u_still;
uniform vec4 u_dust[64];
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 px = v_uv * u_res;

  // The stroke canvas already carries grainy chalk coverage in its alpha
  // channel (the CPU stamps bake their own per-speck alpha); a second,
  // purely screen-space speckle roughens that coverage further so the
  // board grain reads even where a stroke sits fully opaque. Static in
  // screen space only — no time term, so this never animates.
  float coverage = texture(u_stroke, v_uv).a;
  float speckle = mix(1.0, kx_hash(floor(px)), clamp(u_grain, 0.0, 1.0));
  float strokeAlpha = clamp(coverage * speckle, 0.0, 1.0);

  // Falling dust: a fixed-size array of discs, each (x, y, radius, alpha)
  // in CSS pixels — zero alpha entries are unused slots and contribute
  // nothing. Reduced motion zeroes the whole term defensively even though
  // the CPU side never spawns dust while it is on.
  float dustAlpha = 0.0;
  for (int i = 0; i < 64; i++) {
    vec4 d = u_dust[i];
    if (d.w <= 0.0) continue;
    float dist = length(px - d.xy);
    float mask = 1.0 - smoothstep(0.0, max(d.z, 0.5), dist);
    dustAlpha += mask * d.w;
  }
  dustAlpha = clamp(dustAlpha, 0.0, 1.0) * (1.0 - u_still);

  float alpha = clamp(strokeAlpha + dustAlpha * (1.0 - strokeAlpha), 0.0, 1.0);
  o_color = vec4(u_color.rgb, alpha * u_color.a);
}
`;

// Chalk stamps land every this many CSS px along a dragged segment.
const STAMP_STEP_PX = 2;
// Specks drawn per stamp — the grain a single chalk disc is built from.
const SPECKS_PER_STAMP = 9;

// Dust particles: a small CPU list (capacity), the shader only ever reads
// the most recent slice of it (uniform array budget).
const MAX_DUST = 96;
const DUST_UNIFORM_COUNT = 64;
const DUST_LIFETIME_MS = 600;
const DUST_FALL_PX = 30;
const DUST_PER_STAMP = 2;

// Fixed, non-random smear arcs drawn by the first double-click wipe —
// proportions of the board's own size, never generated from chance.
const SMEAR_ARCS = [
  { cx: 0.3, cy: 0.42, r: 0.3, start: 0.4, end: 3.4, w: 0.05 },
  { cx: 0.66, cy: 0.58, r: 0.22, start: 2.0, end: 5.6, w: 0.04 },
  { cx: 0.48, cy: 0.28, r: 0.36, start: 1.2, end: 4.0, w: 0.035 },
] as const;

/** Deterministic 2-argument hash, same formula as the shader's own
 * kx_hash — the CPU-side source of "random" so a given sequence of stamps
 * always renders the same grain and dust scatter. */
function hash2(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Stamps one chalk disc at (x, y): a handful of 1px specks scattered
 * within `width / 2` of the centre, each speck's alpha drawn from a hash
 * of the stamp's running index and its own speck index — deterministic,
 * never Math.random, so the same stroke always grains the same way. */
function stampChalk(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  colorRgba: [number, number, number, number],
  stampIndex: number,
): void {
  const radius = Math.max(width, 1) / 2;
  const r = Math.round(colorRgba[0] * 255);
  const g = Math.round(colorRgba[1] * 255);
  const b = Math.round(colorRgba[2] * 255);
  const baseAlpha = colorRgba[3];
  // A soft core first, so the line reads as a chalk stroke and not only as
  // its grain; the specks then roughen its edge.
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.42 * baseAlpha).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(radius * 0.9, 0.75), 0, Math.PI * 2);
  ctx.fill();
  for (let s = 0; s < SPECKS_PER_STAMP; s += 1) {
    const angle = hash2(stampIndex, s + 0.25) * Math.PI * 2;
    const dist = hash2(stampIndex, s + 10.75) * radius;
    const alpha = (0.25 + hash2(stampIndex, s + 20.5) * 0.65) * baseAlpha;
    const px = x + Math.cos(angle) * dist;
    const py = y + Math.sin(angle) * dist;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
  }
}

/** Stamps every 2px along (x0,y0)→(x1,y1); returns the advanced stamp
 * index and every stamp position, so the caller can seed dust at each one. */
function strokeSegment(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  colorRgba: [number, number, number, number],
  startIndex: number,
): { nextIndex: number; stamps: { x: number; y: number }[] } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return { nextIndex: startIndex, stamps: [] };
  const steps = Math.max(1, Math.round(dist / STAMP_STEP_PX));
  const stamps: { x: number; y: number }[] = [];
  let index = startIndex;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    stampChalk(ctx, x, y, width, colorRgba, index);
    stamps.push({ x, y });
    index += 1;
  }
  return { nextIndex: index, stamps };
}

/** A soft eraser pass: fades existing marks by 0.85 via destination-out,
 * then drags a few fixed grey arcs across the board (source-over) so the
 * pass reads as a smear rather than a flat fade. Composite mode is always
 * restored before returning, so the next chalk stamp draws normally. */
function wipeBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  const scale = Math.min(width, height);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(148, 150, 145, 0.22)";
  ctx.lineCap = "round";
  for (const arc of SMEAR_ARCS) {
    ctx.lineWidth = Math.max(1, arc.w * scale);
    ctx.beginPath();
    ctx.arc(arc.cx * width, arc.cy * height, arc.r * scale, arc.start, arc.end);
    ctx.stroke();
  }
  ctx.restore();
}

/** Full clear — every mark gone, no residue. */
function clearBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
}

type DustParticle = { x: number; y: number; born: number };

/** Appends `count` dust particles at (x, y) — jittered a few px apart by
 * the same deterministic hash the stamps use — trimming the oldest past
 * `MAX_DUST`. A module-level function so the ref's array is only ever
 * mutated here, never inline inside a hook body. */
function spawnDust(
  list: DustParticle[],
  x: number,
  y: number,
  now: number,
  count: number,
  stampIndex: number,
): DustParticle[] {
  for (let i = 0; i < count; i += 1) {
    const jitter = (hash2(stampIndex, i + 40.5) - 0.5) * 6;
    list.push({ x: x + jitter, y, born: now });
  }
  if (list.length > MAX_DUST) list.splice(0, list.length - MAX_DUST);
  return list;
}

/** Drops particles past their lifetime. */
function stepDust(list: DustParticle[], now: number): DustParticle[] {
  return list.filter((p) => now - p.born < DUST_LIFETIME_MS);
}

/** Packs the most recent slice of the dust list (bounded by the shader's
 * uniform-array budget) into a flat vec4-per-particle buffer: (x, y,
 * radius, alpha), falling and fading over `DUST_LIFETIME_MS`. */
function buildDustUniform(list: DustParticle[], now: number): Float32Array {
  const data = new Float32Array(DUST_UNIFORM_COUNT * 4);
  const count = Math.min(list.length, DUST_UNIFORM_COUNT);
  const start = list.length - count;
  for (let i = 0; i < count; i += 1) {
    const p = list[start + i];
    if (!p) continue;
    const t = clamp((now - p.born) / DUST_LIFETIME_MS, 0, 1);
    const o = i * 4;
    data[o] = p.x;
    data[o + 1] = p.y + t * t * DUST_FALL_PX;
    data[o + 2] = 1.5;
    data[o + 3] = (1 - t) * 0.9;
  }
  return data;
}

/** How many dust motes one stamp sheds — `dust` scales the fixed
 * per-stamp count, clamped to a sane range. */
function dustCountFor(dust: number): number {
  return Math.max(0, Math.min(6, Math.round(DUST_PER_STAMP * dust)));
}

type ChalkDustLayerProps = Required<
  Pick<ChalkDustProps, "width" | "color" | "grain" | "dust" | "wipe">
>;

/**
 * The GL layer. Owns the context, the program, the offscreen stroke
 * canvas, the CPU dust list, and the frame loop; reads everything else
 * from the surface.
 */
function ChalkDustLayer({
  width,
  color,
  grain,
  dust,
  wipe,
}: ChalkDustLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const loopFrameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  // The stroke canvas: an offscreen 2D canvas at the GL canvas's own
  // device-pixel resolution, recreated (which wipes every mark) whenever
  // that resolution changes.
  const strokeCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const strokeCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const strokeSizeRef = React.useRef({ width: 0, height: 0 });
  const strokeTextureRef = React.useRef<WebGLTexture | null>(null);
  const strokeVersionRef = React.useRef(0);
  const strokeUploadedVersionRef = React.useRef(0);

  const colorRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const dustRef = React.useRef<DustParticle[]>([]);
  const stampIndexRef = React.useRef(0);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const capturedRef = React.useRef(false);
  const isDraggingRef = React.useRef(false);
  const recentlyWipedRef = React.useRef(false);
  const ensureLoopRef = React.useRef<(() => void) | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ width, grain, dust, wipe });
  React.useEffect(() => {
    paramsRef.current = { width, grain, dust, wipe };
  });

  // One frame: (re)size the stroke canvas to match the GL canvas's own
  // backing store, upload it if it changed, then draw the stroke plus the
  // current dust scatter.
  const drawFrame = React.useCallback((now: number) => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas) return;
    if (gl.isContextLost()) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    strokeSizeRef.current = { width: cssW, height: cssH };

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
      // reapply it so every draw call below can stay in CSS-pixel space.
      if (sctx) sctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      dustRef.current = [];
      lastPointRef.current = null;
      recentlyWipedRef.current = false;
      strokeVersionRef.current += 1;
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
    const strokeTexture = strokeTextureRef.current;
    if (!strokeTexture) return;

    const p = paramsRef.current;
    const dustData = buildDustUniform(dustRef.current, now);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_stroke", strokeTexture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_color: colorRef.current,
      u_grain: p.grain,
      u_still: live.motionSafe ? 0 : 1,
      u_dust: dustData,
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
    strokeUploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (loopFrameRef.current !== null)
        cancelAnimationFrame(loopFrameRef.current);
      loopFrameRef.current = null;
      failedRef.current = true;
    });
    // Draw the (empty) board immediately rather than waiting for a stroke.
    requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
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

  // The loop: runs while a stroke is being dragged or dust is still
  // falling, gated by the surface being active, the host being on screen,
  // and the tab being visible — and stops itself once both go quiet.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let inView = true;

    const shouldRun = () => isDraggingRef.current || dustRef.current.length > 0;

    const tick = (now: number) => {
      loopFrameRef.current = null;
      dustRef.current = stepDust(dustRef.current, now);
      drawFrame(now);
      if (inView && !document.hidden && shouldRun()) {
        loopFrameRef.current = requestAnimationFrame(tick);
      }
    };

    const ensureRunning = () => {
      if (loopFrameRef.current !== null || !inView || document.hidden) return;
      if (!shouldRun()) return;
      loopFrameRef.current = requestAnimationFrame(tick);
    };
    ensureLoopRef.current = ensureRunning;

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      if (inView) {
        ensureRunning();
      } else if (loopFrameRef.current !== null) {
        cancelAnimationFrame(loopFrameRef.current);
        loopFrameRef.current = null;
      }
    });
    intersection.observe(host);

    const onVisibility = () => {
      if (document.hidden) {
        if (loopFrameRef.current !== null) {
          cancelAnimationFrame(loopFrameRef.current);
          loopFrameRef.current = null;
        }
      } else {
        ensureRunning();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      ensureLoopRef.current = null;
      if (loopFrameRef.current !== null)
        cancelAnimationFrame(loopFrameRef.current);
      loopFrameRef.current = null;
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, drawFrame]);

  // Pointer + double-click on the host: pointer capture tracks a drag from
  // down to up, stamping every 2px of the segment travelled and shedding
  // dust at each stamp; double-click smears the board, a second
  // double-click (with nothing drawn since) clears it outright.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // Capture only once a real drag begins (see move), so a plain click
      // still reaches the controls under the board.
      capturedRef.current = false;
      pointerIdRef.current = event.pointerId;
      isDraggingRef.current = true;
      lastPointRef.current = { x, y };

      const ctx = strokeCtxRef.current;
      if (ctx) {
        const p = paramsRef.current;
        stampChalk(ctx, x, y, p.width, colorRef.current, stampIndexRef.current);
        const spawnCount = dustCountFor(p.dust);
        if (surfaceRef.current.motionSafe && spawnCount > 0) {
          dustRef.current = spawnDust(
            dustRef.current,
            x,
            y,
            performance.now(),
            spawnCount,
            stampIndexRef.current,
          );
        }
        stampIndexRef.current += 1;
        strokeVersionRef.current += 1;
        recentlyWipedRef.current = false;
      }
      ensureLoopRef.current?.();
    };

    const move = (event: PointerEvent) => {
      if (!isDraggingRef.current || pointerIdRef.current !== event.pointerId) {
        return;
      }
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const ctx = strokeCtxRef.current;
      const last = lastPointRef.current;
      if (
        !capturedRef.current &&
        last &&
        Math.hypot(x - last.x, y - last.y) > 4
      ) {
        host.setPointerCapture(event.pointerId);
        capturedRef.current = true;
      }
      if (ctx && last) {
        const p = paramsRef.current;
        const result = strokeSegment(
          ctx,
          last.x,
          last.y,
          x,
          y,
          p.width,
          colorRef.current,
          stampIndexRef.current,
        );
        stampIndexRef.current = result.nextIndex;
        if (result.stamps.length > 0) {
          strokeVersionRef.current += 1;
          recentlyWipedRef.current = false;
          const spawnCount = dustCountFor(p.dust);
          if (surfaceRef.current.motionSafe && spawnCount > 0) {
            let list = dustRef.current;
            const now = performance.now();
            for (const stamp of result.stamps) {
              list = spawnDust(
                list,
                stamp.x,
                stamp.y,
                now,
                spawnCount,
                stampIndexRef.current,
              );
            }
            dustRef.current = list;
          }
        }
      }
      lastPointRef.current = { x, y };
      ensureLoopRef.current?.();
    };

    const up = (event: PointerEvent) => {
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
      lastPointRef.current = null;
    };

    const dblclick = (event: MouseEvent) => {
      if (!paramsRef.current.wipe) return;
      const ctx = strokeCtxRef.current;
      if (!ctx) return;
      event.preventDefault();
      const { width: w, height: h } = strokeSizeRef.current;
      if (recentlyWipedRef.current) {
        clearBoard(ctx, w, h);
        recentlyWipedRef.current = false;
      } else {
        wipeBoard(ctx, w, h);
        recentlyWipedRef.current = true;
      }
      strokeVersionRef.current += 1;
      requestFrame();
    };

    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("dblclick", dblclick);
    return () => {
      if (pointerIdRef.current !== null) {
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
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("dblclick", dblclick);
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="chalk-dust"
      className="block h-full w-full"
    />
  );
}

/**
 * A chalkboard laid over the interface. Drag across it and a scattered
 * line grows along the path — every 2px is its own stamp, and every stamp
 * is a handful of 1px specks with a hashed alpha, so the mark reads as
 * chalk grain rather than a smooth vector line. The marks live on an
 * offscreen 2D canvas at the board's own device resolution (stamped, never
 * simulated), re-uploaded as a texture each frame a stroke is active; a
 * shed of dust motes at each stamp falls and fades on its own fixed clock,
 * tracked as a small CPU list and read into the shader as an array of
 * discs. Double-click smears the board with a soft eraser pass and a few
 * fixed grey arcs; double-click again, with nothing drawn since, wipes it
 * bare.
 * Reduced motion: strokes still draw — this is drawing, not motion — but
 * no dust is spawned, so nothing falls.
 */
export function ChalkDust({
  width = 5,
  color = "#f4f1ea",
  grain = 0.6,
  dust = 1,
  wipe = true,
  paint,
  className,
  children,
}: ChalkDustProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-crosshair touch-none", className)}
      effect={
        <ChalkDustLayer
          width={width}
          color={color}
          grain={grain}
          dust={dust}
          wipe={wipe}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
