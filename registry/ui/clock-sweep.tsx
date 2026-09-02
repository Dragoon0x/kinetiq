"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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

export type ClockSweepProps = {
  /** Seconds for one full turn of the sweep. @default 60 */
  period?: number;
  /** Sweep hub, as a fraction of the surface's width and height; a click on the host moves it there. @default [0.5, 0.5] */
  center?: [number, number];
  /** Sweep colour. @default "#22c55e" */
  color?: string;
  /** Wake length, as a fraction of a full turn — how far behind the hand the trailing glow reaches. @default 0.25 */
  wake?: number;
  /** Crisp edge width, in degrees. @default 2.5 */
  width?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_angle;
uniform float u_width;
uniform float u_wake;
uniform vec3 u_color;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

const float TWO_PI = 6.28318530718;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float lumaAt(vec2 px, vec2 offset) {
  return kx_luma(sampleOver((px + offset) / u_res));
}

// 3x3 Sobel edge magnitude over the painted texture's own luminance,
// centred at px — the same probe edge-halo.tsx uses for its own glow.
float sobelEdge(vec2 px) {
  float tl = lumaAt(px, vec2(-1.0, -1.0));
  float tc = lumaAt(px, vec2(0.0, -1.0));
  float tr = lumaAt(px, vec2(1.0, -1.0));
  float ml = lumaAt(px, vec2(-1.0, 0.0));
  float mr = lumaAt(px, vec2(1.0, 0.0));
  float bl = lumaAt(px, vec2(-1.0, 1.0));
  float bc = lumaAt(px, vec2(0.0, 1.0));
  float br = lumaAt(px, vec2(1.0, 1.0));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_center;
  float pixelAngle = atan(d.y, d.x);

  // Reduced motion pins the hand at angle zero and drops the wake term
  // entirely — everything else (the crisp edge, the Sobel flare) still
  // reads off this one still angle.
  float angle = u_still > 0.5 ? 0.0 : u_angle;
  float delta = mod(angle - pixelAngle, TWO_PI);

  float edgeWidth = max(radians(u_width), 0.0008);
  float edge = exp(-pow(delta / edgeWidth, 2.0));

  float wakeLength = max(u_wake, 0.001) * TWO_PI;
  float wake = u_still > 0.5 ? 0.0 : exp(-delta / wakeLength);

  float alpha = clamp(edge + wake * 0.35, 0.0, 1.0) * 0.6;

  // A real edge in the painted interface, under the crisp band, flares the
  // line brighter — read straight off the texture, never a canned overlay.
  float sobel = clamp(sobelEdge(px), 0.0, 1.0);
  vec3 outColor = u_color * (1.0 + 0.2 * edge * sobel);

  o_color = vec4(outColor, alpha);
}
`;

/** Walks up from the host to the first opaque background colour, so a
 * transparent texel composites onto the real page rather than onto black —
 * the same probe crystal-lens and dust-reveal use for their own backdrop. */
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

type SweepLayerProps = Required<
  Pick<ClockSweepProps, "period" | "center" | "color" | "wake" | "width">
>;

/**
 * The GL layer. Owns the context, the program, the texture, the hub
 * position, and the frame loop; reads everything else from the surface.
 */
function SweepLayer({ period, center, color, wake, width }: SweepLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const cx = useMotionValue<number>(center[0]);
  const cy = useMotionValue<number>(center[1]);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ period, width, wake });
  React.useEffect(() => {
    paramsRef.current = { period, width, wake };
  });

  // One frame: upload the texture if a new paint landed, work out the
  // hand's current angle from the rAF clock, then draw.
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
    const still = !live.motionSafe;

    const safePeriod = Math.max(p.period, 0.001);
    const phase = (((tickRef.current / safePeriod) % 1) + 1) % 1;
    const angle = phase * Math.PI * 2;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_center: [cx.get() * cssW, cy.get() * cssH],
      u_angle: angle,
      u_width: p.width,
      u_wake: p.wake,
      u_color: [colorRef.current[0], colorRef.current[1], colorRef.current[2]],
      u_still: still ? 1 : 0,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [cx, cy]);

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
    // A paint may already be waiting: draw it now rather than on the next
    // tick.
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

  // Every completed paint, and every hub move, asks for a frame — this
  // alone covers the whole effect whenever the sweep loop below is stopped
  // (reduced motion).
  React.useEffect(() => {
    const unsubs = [cx, cy].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [cx, cy, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colour resolves against the host so a `var(--token)` picks up the
  // theme in force on this subtree; the background probe feeds the same
  // sampleOver the Sobel read composites over.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // A reduced-motion toggle mid-session must redraw right away — the sweep
  // loop below won't run to do it for us once it stops.
  React.useEffect(() => {
    requestFrame();
  }, [surface.motionSafe, requestFrame]);

  // A click on the host moves the hub there. Reduced motion jumps it
  // instead of springing, matching the house pointer convention.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const down = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const fx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const fy = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      if (surfaceRef.current.motionSafe) {
        animate(cx, fx, springs.snap);
        animate(cy, fy, springs.snap);
      } else {
        cx.jump(fx);
        cy.jump(fy);
      }
    };

    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointerdown", down);
    };
  }, [surface.host, cx, cy]);

  // The continuous sweep: a rAF tick that only exists to advance the hand
  // and redraw every frame while it should be turning. Gated the same way
  // as the GL effect (only while the surface is active) plus
  // IntersectionObserver/visibilitychange, and skipped outright under
  // reduced motion — where the layer draws exactly one still frame instead,
  // via the version- and motionSafe-change effects above.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the hand resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncLoop();
    });
    intersection.observe(host);
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.motionSafe, surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="clock-sweep"
      className="block h-full w-full"
    />
  );
}

/**
 * A line of light turns across the interface once every `period` seconds,
 * sweeping from a hub instead of hinging on a face — its angle comes
 * straight off the rAF clock (`fract(tick / period) * 2π`), never a random
 * draw. A crisp front edge fades into a longer wake trailing behind it, and
 * wherever that band crosses a real edge in the painted interface the line
 * brightens further, read off the texture with a 3×3 Sobel pass rather than
 * a canned highlight. Click anywhere on the panel and the hub jumps there,
 * so the next turn sweeps from wherever you last looked. Everywhere the
 * band isn't, the canvas draws nothing at all — the page beneath is the
 * real, live DOM.
 * Reduced motion: the sweep stops on a single still line at angle zero with
 * no wake, drawn once.
 */
export function ClockSweep({
  period = 60,
  center = [0.5, 0.5],
  color = "#22c55e",
  wake = 0.25,
  width = 2.5,
  paint,
  className,
  children,
}: ClockSweepProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <SweepLayer
          period={period}
          center={center}
          color={color}
          wake={wake}
          width={width}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
