"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type InkFeatherProps = {
  /** How far a stroke bleeds into the fibres at full wetness, in CSS pixels. @default 8 */
  spread?: number;
  /** Strength of the fibre-direction noise driving the feather's angle. @default 1 */
  fibres?: number;
  /** Seconds a fresh paint takes to dry back to crisp. @default 6 */
  dry?: number;
  /** The paper's own colour — the base every stroke feathers into, and the fill wherever the page has nothing painted. @default "#f6f1e7" */
  paper?: string;
  /** Fill colour used, with the paper, to tell real ink from blank page; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_wet;
uniform float u_spread;
uniform float u_fibres;
uniform vec4 u_paper;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_LUMA}

// Ink at a pixel: dark, actually painted (not merely a transparent texel),
// and far enough from the page's own background to be writing rather than
// blank stock sitting under the same threshold.
float inkAt(vec2 px) {
  vec2 uv = px / u_res;
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  vec3 composited = mix(u_bg.rgb, t.rgb, t.a);
  float luma = kx_luma(composited);
  float m = smoothstep(0.3, 0.85, 1.0 - luma);
  float gate = step(0.01, t.a) * step(0.04, length(t.rgb - u_bg.rgb));
  return m * gate;
}

void main() {
  vec2 px = v_uv * u_res;
  vec4 tex = texture(u_tex, v_uv);

  // The paper's own grain: a low-frequency noise field warped into an
  // angle, so the bleed follows fibre direction instead of a fixed axis.
  float theta = (kx_noise(px * 0.02) - 0.5) * 3.14159265 * u_fibres + 0.3;
  vec2 dir = vec2(cos(theta), sin(theta));

  float m = inkAt(px);

  // Eight taps along the fibre, each side, weighted down with distance and
  // scaled by how wet the paint still is — dry ink (u_wet = 0) collapses
  // every tap onto the centre pixel.
  float feathered = 0.0;
  for (int k = 1; k <= 8; k += 1) {
    float weight = 1.0 - float(k) / 9.0;
    vec2 offset = dir * (float(k) / 8.0) * u_spread * u_wet;
    feathered = max(feathered, inkAt(px + offset) * weight);
    feathered = max(feathered, inkAt(px - offset) * weight);
  }
  feathered = smoothstep(0.1, 0.6, feathered);

  // Pooling: a soft three-tap blur along the same fibre catches ink that
  // has wicked into a valley and darkens it past the feather alone.
  vec2 poolOffset = dir * 1.5;
  float blurredM = (m + inkAt(px + poolOffset) + inkAt(px - poolOffset)) / 3.0;
  float pool = step(0.6, blurredM);

  vec3 base = mix(u_paper.rgb, tex.rgb, tex.a);
  vec3 result = base * (1.0 - feathered * 0.9 * (1.0 - m));
  result *= 1.0 - pool * 0.15;

  o_color = vec4(clamp(result, 0.0, 1.0), 1.0);
}
`;

type FeatherLayerProps = Required<
  Pick<InkFeatherProps, "spread" | "fibres" | "dry" | "paper">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so the
 * ink-detection gate compares against the page's real backdrop rather than
 * black — the same probe crystal-lens and thermal-receipt use. */
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

/**
 * The GL layer. Owns the context, the program, the page texture, the
 * wetness clock and the frame loop; reads everything else from the
 * surface.
 */
function FeatherLayer({
  spread,
  fibres,
  dry,
  paper,
  background,
}: FeatherLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const paperRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  // Wetness is one scalar, not a per-pixel map: `paintedAt` is the
  // rAF/performance.now()-domain timestamp the current paint landed at,
  // `wetRef` is 1 - clamp(age / dry, 0, 1) recomputed every tick.
  const paintedAtRef = React.useRef<number | null>(null);
  const lastVersionRef = React.useRef(0);
  const wetRef = React.useRef(0);
  // Bridges the wet loop (below) to the version-watch effect, so a new
  // paint can restart the loop without the loop's own effect (its
  // IntersectionObserver, its visibilitychange listener) ever tearing down.
  const startLoopRef = React.useRef<(() => void) | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ spread, fibres, dry });
  React.useEffect(() => {
    paramsRef.current = { spread, fibres, dry };
  }, [spread, fibres, dry]);

  // One frame: upload the texture if a new paint landed, then draw at the
  // current wetness.
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
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_wet: wetRef.current,
      u_spread: p.spread,
      u_fibres: p.fibres,
      u_paper: paperRef.current,
      u_bg: bg,
    });
    tri.draw();
  }, []);

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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

  // Resolve the paper and the backdrop colours against the host, so
  // `var(--token)` reads the theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    paperRef.current = resolveColor(paper, host);
    requestFrame();
  }, [surface.host, background, paper, requestFrame]);

  // A completed paint is a fresh stroke: reset the wetness clock to "just
  // landed" and wake the loop below. The very first paint (version 0 -> 1)
  // starts the clock the same way any later repaint does.
  React.useEffect(() => {
    if (surface.version > 0 && surface.version !== lastVersionRef.current) {
      lastVersionRef.current = surface.version;
      paintedAtRef.current = performance.now();
      wetRef.current = 1;
      startLoopRef.current?.();
      requestFrame();
    }
  }, [surface.version, requestFrame]);

  // The wet loop: a rAF clock that recomputes wetness from elapsed time and
  // redraws every frame it runs, but only while the paint is still wet
  // (age < dry), the host is on screen, and the tab is visible — pausing
  // rebases the clock over the gap so drying never jumps forward while
  // unwatched. It stops itself outright once the ink is dry and leaves a
  // single frozen, unfeathered frame; the effect above wakes it again on
  // the next paint.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let pausedAt: number | null = null;
    let inView = false;

    const computeWet = (now: number): number => {
      const paintedAt = paintedAtRef.current;
      if (paintedAt === null) return 0;
      const dryFor = Math.max(paramsRef.current.dry, 0.001);
      const age = (now - paintedAt) / 1000;
      return 1 - Math.min(1, Math.max(0, age / dryFor));
    };

    const stop = () => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const tick = (now: number) => {
      wetRef.current = computeWet(now);
      drawFrame();
      if (inView && !document.hidden && wetRef.current > 0) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        if (wetRef.current > 0) pausedAt = performance.now();
      }
    };

    const startLoop = () => {
      if (raf !== 0) return;
      if (!inView || document.hidden) return;
      if (pausedAt !== null && paintedAtRef.current !== null) {
        paintedAtRef.current += performance.now() - pausedAt;
      }
      pausedAt = null;
      // Resync wetness immediately, even when there is nothing left to
      // animate — a value left over from before a pause (or from before
      // the surface went inactive) must never linger unrendered.
      const wet = computeWet(performance.now());
      if (wet !== wetRef.current) {
        wetRef.current = wet;
        requestFrame();
      }
      if (wet <= 0) return;
      raf = requestAnimationFrame(tick);
    };
    startLoopRef.current = startLoop;
    startLoop();

    const syncVisibility = () => {
      const visible = inView && !document.hidden;
      if (visible) {
        startLoop();
      } else if (raf !== 0) {
        stop();
        pausedAt = performance.now();
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncVisibility();
    });
    intersection.observe(host);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      startLoopRef.current = null;
      stop();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [surface.active, surface.host, drawFrame, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="ink-feather"
      className="block h-full w-full"
    />
  );
}

/**
 * Fresh ink feathering into the paper as it dries. Wetness is a single
 * scalar, not a per-pixel map — the seconds since the interface was last
 * repainted, run through `dry` — so the whole page dries on one clock, and
 * the shader spends its per-pixel budget on a noise field standing in for
 * the paper's own fibre direction instead. Every tap samples the live page
 * itself and is gated against the page's own background, so the bleed only
 * ever touches pixels that are actually dark ink, never blank stock; a
 * three-tap blur along that same fibre direction darkens the spots where
 * ink has pooled thickest. The loop wakes on every fresh paint and lets
 * itself go still once the ink is dry, leaving a single crisp frame.
 * Reduced motion: `SurfacePaint` holds `active` false in replace mode, so
 * this layer renders nothing and the real DOM shows in its place.
 */
export function InkFeather({
  spread = 8,
  fibres = 1,
  dry = 6,
  paper = "#f6f1e7",
  background,
  paint,
  className,
  children,
}: InkFeatherProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FeatherLayer
          spread={spread}
          fibres={fibres}
          dry={dry}
          paper={paper}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
