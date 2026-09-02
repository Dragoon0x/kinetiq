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

export type FilmReelProps = {
  /** Gate-weave strength — how far the frame jumps in the film gate from one projected frame to the next, in CSS pixels. @default 1.5 */
  weave?: number;
  /** Grain strength, resampled per pixel every projected frame. @default 0.12 */
  grain?: number;
  /** Chance per projected frame of a dust speck (and, at half this, of a hair). @default 0.35 */
  dust?: number;
  /** How far the image is pulled toward a warm sepia tint (0..1). @default 0.35 */
  fade?: number;
  /** Corner vignette strength. @default 0.4 */
  vignette?: number;
  /** The projector's own clock, in frames per second — distinct from the screen's refresh rate. @default 18 */
  fps?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_NOISE +
  GLSL_LUMA +
  /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_fps;
uniform float u_weave;
uniform float u_grain;
uniform float u_dust;
uniform float u_fade;
uniform float u_vignette;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  float aspect = u_res.x / max(u_res.y, 1.0);

  // The projected frame: the screen keeps redrawing at its own refresh
  // rate, but every value below only changes when this index steps, so the
  // picture holds still for a whole projected frame the way a real print
  // does, instead of crawling every screen refresh.
  float f = floor(u_tick * max(u_fps, 1.0));

  // Gate weave: a real film gate is never perfectly still, so each frame
  // sits a little off from the last one — a held jump, not a drift.
  vec2 weave = (vec2(
    kx_noise(vec2(f * 0.7, 0.0)),
    kx_noise(vec2(f * 0.9 + 3.0, 0.0))
  ) - 0.5) * u_weave;
  vec3 color = sampleOver(v_uv + weave / u_res);

  // Grain: seeded from the pixel and the frame index, so it holds with the
  // frame instead of re-rolling every screen refresh.
  color += vec3((kx_hash(px + f) - 0.5) * u_grain);

  // Dust: a per-frame gate draws one speck, and sometimes a second, each a
  // small dark disc at a hashed position and radius.
  if (kx_hash(vec2(f, 0.0)) < u_dust) {
    vec2 c1 = vec2(kx_hash(vec2(f, 1.0)), kx_hash(vec2(f, 2.0)));
    float r1 = mix(0.0035, 0.01, kx_hash(vec2(f, 3.0)));
    float d1 = length((v_uv - c1) * vec2(aspect, 1.0));
    color = mix(color, vec3(0.02), (1.0 - smoothstep(r1 * 0.55, r1, d1)) * 0.92);

    if (kx_hash(vec2(f, 8.0)) < 0.5) {
      vec2 c2 = vec2(kx_hash(vec2(f, 4.0)), kx_hash(vec2(f, 5.0)));
      float r2 = mix(0.003, 0.008, kx_hash(vec2(f, 6.0)));
      float d2 = length((v_uv - c2) * vec2(aspect, 1.0));
      color = mix(color, vec3(0.02), (1.0 - smoothstep(r2 * 0.55, r2, d2)) * 0.92);
    }
  }

  // A hair: a thin dark capsule between two hashed points, gated on its
  // own clock so it comes and goes independently of the specks.
  if (kx_hash(vec2(f + 7.0, 0.0)) < u_dust * 0.5) {
    vec2 pA = vec2(kx_hash(vec2(f + 7.0, 1.0)), kx_hash(vec2(f + 7.0, 2.0)));
    vec2 pB = pA + (vec2(
      kx_hash(vec2(f + 7.0, 3.0)),
      kx_hash(vec2(f + 7.0, 4.0))
    ) - 0.5) * 0.5;
    vec2 pt = (v_uv - pA) * vec2(aspect, 1.0);
    vec2 seg = (pB - pA) * vec2(aspect, 1.0);
    float segLen2 = max(dot(seg, seg), 1e-6);
    float along = clamp(dot(pt, seg) / segLen2, 0.0, 1.0);
    float dHair = length(pt - seg * along);
    color = mix(color, vec3(0.03), (1.0 - smoothstep(0.0012, 0.0024, dHair)) * 0.85);
  }

  // Warm fade: pull toward a sepia tint built from the pixel's own luma, so
  // dark and light areas fade toward the same warm stock colour.
  vec3 sepia = vec3(kx_luma(color)) * vec3(1.07, 0.86, 0.62);
  color = mix(color, sepia, u_fade);

  // Vignette by distance from centre, aspect-corrected.
  vec2 centered = (v_uv - 0.5) * vec2(aspect, 1.0);
  color *= clamp(1.0 - length(centered) * u_vignette, 0.0, 1.0);

  // A bright flicker band at the sprocket edge, on frames a hash picks out.
  if (kx_hash(vec2(f + 13.0, 0.0)) < 0.15) {
    float edge = 1.0 - smoothstep(0.0, 0.045, v_uv.x);
    color += vec3(0.55, 0.5, 0.4) * edge;
  }

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type FilmReelLayerProps = Required<
  Pick<FilmReelProps, "weave" | "grain" | "dust" | "fade" | "vignette" | "fps">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, same as
 * tape-wear, unless `override` is given — `within` scopes any var() token
 * in `override` (or a walked-up token) to the host's own theme. */
function effectiveBackground(
  el: HTMLElement | null,
  override?: string,
): [number, number, number, number] {
  if (override) return resolveColor(override, el);
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg, node);
    if (rgba[3] > 0.01) return rgba;
    node = node.parentElement;
  }
  return resolveColor(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--background",
    ) || "#fff",
    document.documentElement,
  );
}

/**
 * The GL layer. Owns the context, the program, the texture, the projector
 * clock, and the frame loop; reads everything else from the surface.
 */
function FilmReelLayer({
  weave,
  grain,
  dust,
  fade,
  vignette,
  fps,
  background,
}: FilmReelLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ weave, grain, dust, fade, vignette, fps });
  React.useEffect(() => {
    paramsRef.current = { weave, grain, dust, fade, vignette, fps };
  });

  // One frame: upload the texture if a new paint landed, then draw every
  // uniform from the refs above (never from React state).
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

    const sized = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = sized.width / sized.dpr;
    const cssH = sized.height / sized.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_tick: tickRef.current,
      u_fps: p.fps,
      u_weave: p.weave,
      u_grain: p.grain,
      u_dust: p.dust,
      u_fade: p.fade,
      u_vignette: p.vignette,
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

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour whenever the host or the override changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host, background);
  }, [surface.host, background]);

  // The continuous loop: the projector never stops rolling on its own, so
  // `u_tick` advances every frame the host is actually visible. Gated by
  // IntersectionObserver and page visibility, same as the GL effect, only
  // while `surface.active` — dust-reveal's idle loop, minus the pointer
  // dependence.
  React.useEffect(() => {
    if (!surface.active) return;
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
        // Rebase the clock over the pause so playback resumes, not jumps.
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
  }, [surface.active, surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="film-reel"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface projected off 35mm stock: the whole frame steps on the
 * projector's own clock, not the screen's, so the gate weave, the grain,
 * whether a speck or a hair lands, and the sprocket-edge flicker all hold
 * for one projected frame before jumping to the next, the way a real gate
 * advances rather than drifts. Every flaw is seeded from the frame index
 * alone, never Math.random, so the same reel always shows the same dirt on
 * the same frame; a warm sepia fade and a corner vignette sit over the top,
 * the way a worn print reads under a lamp. It stands on
 * `<SurfacePaint mode="replace">`: the canvas is the page, and the
 * projector clock pauses off-screen and behind a hidden tab, resuming
 * rather than jumping.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function FilmReel({
  weave = 1.5,
  grain = 0.12,
  dust = 0.35,
  fade = 0.35,
  vignette = 0.4,
  fps = 18,
  background,
  paint,
  className,
  children,
}: FilmReelProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FilmReelLayer
          weave={weave}
          grain={grain}
          dust={dust}
          fade={fade}
          vignette={vignette}
          fps={fps}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
