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

export type NeonBuzzProps = {
  /** Luma-inverse cutoff above which a texel reads as inked tube rather than page ground (0..1). @default 0.55 */
  threshold?: number;
  /** The neon gas colour — both the tube's bright core and its halo. @default "#ff4fd8" */
  color?: string;
  /** Halo blur radius in CSS pixels. @default 14 */
  halo?: number;
  /** How far the page dims toward the night tone (0..1); 0 leaves it untouched, 1 is fully night. @default 0.75 */
  dim?: number;
  /** Chance, rolled six times a second per grid region, that the region's tubes drop out for that interval (0..1). @default 0.05 */
  buzz?: number;
  /** Fill for wherever the painted texture is transparent — the colour the night mix starts from. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_threshold;
uniform vec3 u_color;
uniform float u_halo;
uniform float u_dim;
uniform float u_buzz;
uniform float u_tick;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Ink mask: how much this texel reads as drawn content rather than page
// ground. Zero within 0.04 of u_bg so the ground itself never lights up.
float kx_inkMask(vec2 uv) {
  vec3 c = sampleOver(uv);
  float luma = kx_luma(c);
  float th = min(u_threshold, 0.999);
  float m = smoothstep(th, 1.0, 1.0 - luma);
  float nearBg = smoothstep(0.0, 0.04, distance(c, u_bg.rgb));
  return m * nearBg;
}

// The same 13-tap Vogel spiral bloom-halo uses, standing in for a two-pass
// blur of the ink mask at a single radius.
const vec2 kx_poisson13[13] = vec2[13](
  vec2(0.1961, 0.0000),
  vec2(-0.2505, 0.2296),
  vec2(0.0382, -0.4368),
  vec2(0.3158, 0.4118),
  vec2(-0.5794, -0.1025),
  vec2(0.5487, -0.3492),
  vec2(-0.1836, 0.6829),
  vec2(-0.3498, -0.6744),
  vec2(0.7593, 0.2775),
  vec2(-0.7900, 0.3261),
  vec2(0.3815, -0.8137),
  vec2(0.2810, 0.8977),
  vec2(-0.8488, -0.4915)
);

float kx_haloMask(vec2 px) {
  float sum = 0.0;
  for (int i = 0; i < 13; i++) {
    vec2 offset = kx_poisson13[i] * max(u_halo, 0.0);
    sum += kx_inkMask((px + offset) / u_res);
  }
  return sum / 13.0;
}

// Which of the 4x3 regions a uv falls in, row-major (0..11).
float kx_region(vec2 uv) {
  float col = floor(clamp(uv.x, 0.0, 0.999) * 4.0);
  float row = floor(clamp(uv.y, 0.0, 0.999) * 3.0);
  return row * 4.0 + col;
}

// Per-region dropout: a region goes dark for a whole 1/6s slot whenever that
// slot's hash lands under buzz, with a fast flicker in the 80ms leading into
// a slot that is about to drop.
float kx_dropout(float region) {
  float slot = floor(u_tick * 6.0);
  float phase = u_tick * 6.0 - slot;
  float toNext = (1.0 - phase) / 6.0;

  float dropped = step(kx_hash(vec2(region, slot)), u_buzz);
  float willDrop = step(kx_hash(vec2(region, slot + 1.0)), u_buzz);
  float preWindow = willDrop * step(toNext, 0.08);

  float flickerOn = step(0.5, kx_hash(vec2(region * 7.13, floor(u_tick * 40.0))));
  float level = mix(1.0, 0.15, dropped);
  level = mix(level, mix(1.0, 0.15, flickerOn), preWindow);
  return level;
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 base = sampleOver(v_uv);
  vec3 night = mix(base, vec3(0.0431, 0.0588, 0.1020), clamp(u_dim, 0.0, 1.0));

  float region = kx_region(v_uv);
  float dropout = kx_dropout(region);
  float hum = 1.0 + 0.03 * sin(u_tick * 377.0);

  // The tube itself reads as a bright, near-white core so the type stays
  // legible; the halo is a softer wash of the gas colour around it, never
  // over it.
  float core = kx_inkMask(v_uv);
  vec3 coreColor = core * mix(u_color, vec3(1.0), 0.7);

  float halo = kx_haloMask(px);
  vec3 haloColor = halo * u_color * 0.5 * (1.0 - core);

  vec3 glow = (coreColor + haloColor) * dropout * hum;

  o_color = vec4(night + glow, 1.0);
}
`;

type NeonBuzzLayerProps = Required<
  Pick<NeonBuzzProps, "threshold" | "color" | "halo" | "dim" | "buzz">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent texture region composites onto the page
 * rather than onto black — the same probe crystal-lens and dust-reveal use. */
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
 * The GL layer. Owns the context, the program, the page texture and the
 * clock-driven frame loop; reads everything else from the surface. There is
 * no pointer springing here — the sign runs on its own clock.
 */
function NeonBuzzLayer({
  threshold,
  color,
  halo,
  dim,
  buzz,
  background,
}: NeonBuzzLayerProps) {
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
  const colorRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ threshold, halo, dim, buzz });
  React.useEffect(() => {
    paramsRef.current = { threshold, halo, dim, buzz };
  });

  // One frame: upload the texture if a new paint landed, then draw the sign
  // at the current clock tick.
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
      u_threshold: p.threshold,
      u_color: colorRef.current.slice(0, 3),
      u_halo: p.halo,
      u_dim: p.dim,
      u_buzz: p.buzz,
      u_tick: tickRef.current,
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
    // clock tick.
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

  // A completed paint (new DOM content, a focus ring, a hover state) always
  // asks for a frame, independent of whether the clock loop is running.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The background and tube colour are resolved against the host so a
  // `var(--token)` reads the theme that applies to it, then re-resolved
  // whenever either prop changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, background, color, requestFrame]);

  // The clock: a plain rAF loop advancing `u_tick` every frame while the
  // sign is on screen, gated by IntersectionObserver and visibilitychange
  // exactly like dust-reveal's idle loop — except there is no drift prop to
  // switch it off, this effect is always continuous while visible.
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
        // Rebase the clock over the pause so the sign resumes, not jumps.
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
      data-effect-canvas="neon-buzz"
      className="block h-full w-full"
    />
  );
}

/**
 * Reads the interface's own ink as neon tubing: wherever a texel is dark
 * enough against the page to count as content, that darkness becomes a lit
 * tube — a bright core mixed toward white at its centre, plus a
 * colour-matched halo blurred outward with the same 13-tap disc bloom-halo
 * uses for its own bright mask. The rest of the page dims toward a fixed
 * night tone, so the tubes read as the only light in the room whether the
 * page underneath started light or dark. A 4x3 grid of regions rolls its
 * own dice six times a second and drops dark for a beat when it comes up
 * under `buzz`, with a fast flicker in the eighty milliseconds leading into
 * a drop and a faint constant hum across the whole sign; the clock alone
 * drives all of it, no pointer sampling anywhere.
 * Reduced motion: `SurfacePaint`'s replace-mode contract handles it — the
 * real DOM shows at full opacity and this layer renders nothing.
 */
export function NeonBuzz({
  threshold = 0.55,
  color = "#ff4fd8",
  halo = 14,
  dim = 0.75,
  buzz = 0.05,
  background,
  paint,
  className,
  children,
}: NeonBuzzProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <NeonBuzzLayer
          threshold={threshold}
          color={color}
          halo={halo}
          dim={dim}
          buzz={buzz}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
