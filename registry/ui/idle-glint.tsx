"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
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

export type IdleGlintProps = {
  /** Seconds of no pointer or keyboard activity before a glint run starts. @default 0.5 */
  idle?: number;
  /** Seconds between the end of one run and the start of the next, while the page is still idle. @default 4 */
  period?: number;
  /** CSS selector for the controls a glint visits, in document order — up to eight. @default "button, [data-glint]" */
  selector?: string;
  /** Glint colour — light enough to read on a dark control, tinted enough to read on a pale one. @default "#93c5fd" */
  color?: string;
  /** Band width in CSS pixels. @default 60 */
  width?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_rect;
uniform float u_radius;
uniform float u_phase;
uniform float u_width;
uniform vec3 u_color;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

// Signed distance to a rounded box centred at the origin.
float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  // A negative phase means no run is in flight — draw nothing.
  if (u_still > 0.5 || u_phase < 0.0) {
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  vec2 halfSize = max(u_rect.zw, vec2(0.0)) * 0.5;
  vec2 center = u_rect.xy + halfSize;
  float radius = clamp(u_radius, 0.0, min(halfSize.x, halfSize.y));
  float sdf = sdRoundBox(px - center, halfSize, radius);
  float clipMask = 1.0 - smoothstep(-1.0, 1.0, sdf);
  if (clipMask <= 0.0) {
    o_color = vec4(0.0);
    return;
  }

  // The band travels left to right across the rect, starting and ending a
  // full width outside its edges so it never pops in or out mid-frame; the
  // vertical skew on the sampled x turns the sweep into a diagonal blade.
  float bandCenter = u_rect.x - u_width + u_phase * (u_rect.z + 2.0 * u_width);
  float skewedX = px.x + (px.y - u_rect.y) * 0.5;
  float halfWidth = max(u_width * 0.5, 0.001);
  float band = 1.0 - smoothstep(0.0, halfWidth, abs(skewedX - bandCenter));

  o_color = vec4(u_color, 0.7 * band * clipMask);
}
`;

/** One collected control: its host-relative rect and its own corner radius. */
type GlintRect = { x: number; y: number; w: number; h: number; radius: number };

/** The shader draws one rect at a time; this only bounds how many the field walks per run. */
const MAX_RECTS = 8;

/** Seconds a glint spends sweeping across a single control. */
const SWEEP_SECONDS = 0.5;

/**
 * Reads up to `MAX_RECTS` host-relative rects for `selector`, in document
 * order, each with its own border radius. A module-level helper that builds
 * and returns a fresh array rather than mutating a value pulled out of a ref
 * inside the effect that calls it — the same shape as glyph-sweep's
 * retainCopy.
 */
function collectRects(host: HTMLElement, selector: string): GlintRect[] {
  const hostRect = host.getBoundingClientRect();
  const found = host.querySelectorAll(selector);
  const rects: GlintRect[] = [];
  for (let i = 0; i < found.length && i < MAX_RECTS; i += 1) {
    const el = found[i];
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    rects.push({
      x: rect.left - hostRect.left,
      y: rect.top - hostRect.top,
      w: rect.width,
      h: rect.height,
      radius,
    });
  }
  return rects;
}

type GlintLayerProps = Required<
  Pick<IdleGlintProps, "idle" | "period" | "selector" | "color" | "width">
>;

/**
 * The GL layer. Owns the context, the program, the idle timer, the sweep
 * loop, and the frame draw; reads everything else from the surface. Never
 * samples the painted texture — the band is a flat overlay, not a
 * distortion of the page underneath.
 */
function GlintLayer({ idle, period, selector, color, width }: GlintLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const colorRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const rectsRef = React.useRef<GlintRect[]>([]);
  const activeRectRef = React.useRef<GlintRect | null>(null);
  const phaseRef = React.useRef(-1);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ idle, period, selector, width });
  React.useEffect(() => {
    paramsRef.current = { idle, period, selector, width };
  });

  // One frame: draw whatever sweep state is current — a band over the
  // active rect, or nothing between runs and under reduced motion.
  const drawFrame = React.useCallback(() => {
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
    const rect = activeRectRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_rect: rect ? [rect.x, rect.y, rect.w, rect.h] : [0, 0, 0, 0],
      u_radius: rect ? rect.radius : 0,
      u_phase: phaseRef.current,
      u_width: paramsRef.current.width,
      u_color: colorRef.current,
      u_still: live.motionSafe ? 0 : 1,
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
    // A paint may already be waiting: draw the (empty) state now rather
    // than leaving the canvas blank until the next frame is requested.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame — layout may have shifted since
  // the last one, and reduced motion may have just flipped.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Rects are re-read on mount and every time a new paint lands — layout
  // may have moved the controls even when nothing else changed.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    rectsRef.current = collectRects(host, selector);
  }, [surface.host, surface.version, selector]);

  // Colour resolves against the host so a var(--token) picks up the theme
  // in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // The idle machine: once nothing has happened for `idle` seconds, sweep a
  // glint across each collected control in turn, then wait `period` seconds
  // and do it again for as long as the page stays idle. Any pointer or
  // keyboard activity on the document cancels a run in progress and resets
  // the idle clock. Every self-scheduling piece here is a plain local
  // function that re-arms itself directly, never a callback stitched
  // together through a hook dependency.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;

    let idleTimer: number | null = null;
    let frame: number | null = null;
    let runToken = 0;

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const hideGlint = () => {
      activeRectRef.current = null;
      phaseRef.current = -1;
      requestFrame();
    };

    const stopRun = () => {
      runToken += 1;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      hideGlint();
    };

    const armTimer = (seconds: number, fn: () => void) => {
      clearIdleTimer();
      idleTimer = window.setTimeout(fn, seconds * 1000);
    };

    const startRun = () => {
      idleTimer = null;
      // A hidden tab throttles or suspends rAF outright; wait for the
      // visibilitychange handler below to pick this back up instead of
      // starting a run that would stall mid-sweep.
      if (document.hidden) return;
      const rects = rectsRef.current;
      if (rects.length === 0) {
        armTimer(paramsRef.current.period, startRun);
        return;
      }
      const myRun = (runToken += 1);
      let index = 0;
      let rectStart: number | null = null;

      const step = (now: number) => {
        if (myRun !== runToken) return;
        const rect = rects[index];
        if (!rect) {
          frame = null;
          hideGlint();
          armTimer(paramsRef.current.period, startRun);
          return;
        }
        if (rectStart === null) rectStart = now;
        const phase = Math.min((now - rectStart) / (SWEEP_SECONDS * 1000), 1);
        activeRectRef.current = rect;
        phaseRef.current = phase;
        drawFrame();
        if (phase >= 1) {
          index += 1;
          rectStart = null;
        }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const onActivity = () => {
      stopRun();
      armTimer(paramsRef.current.idle, startRun);
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopRun();
        clearIdleTimer();
      } else {
        armTimer(paramsRef.current.idle, startRun);
      }
    };

    document.addEventListener("pointermove", onActivity);
    document.addEventListener("pointerdown", onActivity);
    document.addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    armTimer(paramsRef.current.idle, startRun);

    return () => {
      clearIdleTimer();
      if (frame !== null) cancelAnimationFrame(frame);
      runToken += 1;
      document.removeEventListener("pointermove", onActivity);
      document.removeEventListener("pointerdown", onActivity);
      document.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.motionSafe, requestFrame, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="idle-glint"
      className="block h-full w-full"
    />
  );
}

/**
 * A glint that visits the controls on the page when nothing else is
 * happening. Idle for `idle` seconds, it collects up to eight elements
 * matching `selector` in document order — freshly re-read on mount and
 * after every repaint, since layout can move them — and sweeps a soft
 * diagonal band of `color` across each one in turn, half a second per
 * control, then waits `period` seconds and makes another round for as long
 * as the page stays idle. The band is read straight from each control's own
 * live rect and border radius, never from a texture, so it always sits
 * exactly on top of the real element. Any pointer or keyboard activity
 * cancels a run mid-sweep and starts the idle clock over.
 * Reduced motion: nothing draws and no timer ever runs.
 */
export function IdleGlint({
  idle = 0.5,
  period = 4,
  selector = "button, [data-glint]",
  color = "#93c5fd",
  width = 60,
  paint,
  className,
  children,
}: IdleGlintProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <GlintLayer
          idle={idle}
          period={period}
          selector={selector}
          color={color}
          width={width}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
