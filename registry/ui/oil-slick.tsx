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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type OilSlickProps = {
  /** How hard the interference colour tints the page (0..1). @default 0.3 */
  strength?: number;
  /** How fast the thickness field turns over. @default 1 */
  speed?: number;
  /** Spatial frequency of the field — larger reads as a tighter, busier slick. @default 0.003 */
  scale?: number;
  /** Highlight strength where the thickness field changes fastest (0..1). @default 0.4 */
  sheen?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_scale;
uniform float u_speed;
uniform float u_strength;
uniform float u_sheen;
uniform float u_tick;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 page = sampleOver(v_uv);

  // Domain-warped thickness: the base coordinate is pushed sideways by a
  // two-lane flow field before the final fbm lookup, so the film reads as
  // folding over itself rather than just drifting in one direction. Each of
  // the three lookups is offset in space (the 5.2 constant) and walks the
  // clock at its own rate, so the pattern never locks into a single
  // repeating swirl.
  vec2 q = px * u_scale;
  float advance = u_tick * u_speed;
  vec2 w = vec2(
    kx_fbm(q + vec2(advance * 0.05)),
    kx_fbm(q + vec2(5.2) + vec2(advance * 0.04))
  );
  float d = kx_fbm(q + w * 2.0 + vec2(advance * 0.02));

  // Thin-film interference at the warped thickness, mapped to a physical
  // 200..800nm range: refractive index 1.33, red/green/blue read at
  // 650/540/450nm, same optics as a real soap film.
  float thicknessNm = mix(200.0, 800.0, d);
  float filmIndex = 1.33;
  vec3 wavelengths = vec3(650.0, 540.0, 450.0);
  vec3 phase = 2.0 * 3.14159265359 * 2.0 * filmIndex * thicknessNm / wavelengths;
  vec3 reflectance = cos(phase) * cos(phase);

  // The slick tints the page rather than replacing it.
  vec3 tinted = page * (1.0 - u_strength) + page * reflectance * u_strength * 1.6;

  // A soft sheen where the thickness field changes fastest — light catching
  // the fold in the surface.
  float gx = dFdx(d);
  float gy = dFdy(d);
  float grad = length(vec2(gx, gy));
  float sheenAmount = smoothstep(0.0, 0.02, grad) * u_sheen;
  tinted += vec3(sheenAmount);

  o_color = vec4(clamp(tinted, 0.0, 1.0), 1.0);
}
`;

type OilSlickLayerProps = Required<
  Pick<OilSlickProps, "strength" | "speed" | "scale" | "sheen">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a slick
 * sample over a transparent region composites onto the page rather than onto
 * black — the same probe crystal-lens, dust-reveal and soap-film use for
 * their own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture and the turning
 * clock's frame loop; reads everything else from the surface. There is no
 * pointer here — the slick turns on its own, driven only by time.
 */
function OilSlickLayer({
  strength,
  speed,
  scale,
  sheen,
  background,
}: OilSlickLayerProps) {
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
  const paramsRef = React.useRef({ strength, speed, scale, sheen });
  React.useEffect(() => {
    paramsRef.current = { strength, speed, scale, sheen };
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
      u_scale: p.scale,
      u_speed: p.speed,
      u_strength: p.strength,
      u_sheen: p.sheen,
      u_tick: tickRef.current,
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
    // turning-clock tick.
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

  // The turning loop: a rAF tick that advances `u_tick` and redraws every
  // frame so the slick keeps turning. Gated the same way as the GL effect
  // (only while the surface is active) plus IntersectionObserver /
  // visibilitychange — the field turns continuously while visible and pauses
  // off-screen or behind a hidden tab, the same shape as dust-reveal's idle
  // loop, run unconditionally since this effect has no pointer to idle for.
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
        // Rebase the clock over the pause so the field resumes, not jumps.
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

  // The background fill resolves once the host exists (and again if the
  // override prop changes) — no pointer listeners, this effect has none.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="oil-slick"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface under an oil slick: one `kx_fbm` lookup warps where two more
 * are sampled, so the thickness field reads as folding over itself rather
 * than just drifting, and that thickness — mapped to a physical 200..800nm
 * range — drives real thin-film interference (refractive index 1.33,
 * red/green/blue read at 650/540/450nm) that tints the painted page with the
 * oily rainbow a real slick shows, never replacing its colours outright. A
 * soft sheen catches wherever the field changes fastest. The field keeps
 * turning on its own clock for as long as the surface is on screen and the
 * tab is visible, with no pointer involved and no `Math.random` anywhere —
 * only `kx_fbm` walked forward by time.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function OilSlick({
  strength = 0.3,
  speed = 1,
  scale = 0.003,
  sheen = 0.4,
  background,
  paint,
  className,
  children,
}: OilSlickProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <OilSlickLayer
          strength={strength}
          speed={speed}
          scale={scale}
          sheen={sheen}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
