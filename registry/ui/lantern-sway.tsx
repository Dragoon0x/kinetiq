"use client";

import * as React from "react";

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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type LanternSwayProps = {
  /** Seconds per full swing cycle, lamp to lamp. @default 5 */
  period?: number;
  /** Peak horizontal travel from centre, in CSS pixels. @default 90 */
  swing?: number;
  /** How far above the plane the lamp hangs, in CSS pixels — sets how far a shadow stretches as the lamp swings past it. @default 320 */
  height?: number;
  /** Shadow darkness (0..1), before the type-preserving cutout. @default 0.5 */
  shadow?: number;
  /** Warm cast colour pooled where the lamp's light lands, any CSS colour. @default "#ffd9a3" */
  warmth?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_period;
uniform float u_swing;
uniform float u_height;
uniform float u_shadow;
uniform vec3 u_warm;
uniform vec4 u_bg;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

// The painted texture, composited over the background where it is
// transparent — the same "sample over" idiom every effect in this wing uses
// so an unpainted texel reads as background, never as black.
vec3 kx_over(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Ink weight at a uv: dark and different from the background counts as ink;
// background itself never contributes.
float kx_ink(vec2 uv) {
  vec3 c = kx_over(uv);
  float differs = smoothstep(0.03, 0.09, length(c - u_bg.rgb));
  return (1.0 - kx_luma(c)) * differs;
}

void main() {
  vec2 px = v_uv * u_res;

  // The lamp swings on a sine of elapsed time, height px above the plane.
  // Reduced motion drops the sway entirely and hangs it dead centre.
  float lampX = u_res.x * 0.5;
  if (u_still < 0.5) {
    lampX += sin(u_tick * 6.2831853 / max(u_period, 0.001)) * u_swing;
  }
  vec2 lamp = vec2(lampX, -max(u_height, 1.0));

  // A vector pointing away from the lamp, scaled by how far above the plane
  // it hangs — the further a pixel sits from the lamp's foot, the longer its
  // shadow reaches.
  vec2 away = (px - lamp) / max(u_height, 1.0) * 18.0;

  // The shadow at a pixel is a softened copy of the ink that would have to
  // sit one "away" vector closer to the lamp to cast it there — a 5-tap
  // cross blur so the edge isn't a hard silhouette.
  vec2 shadowUV = (px - away) / u_res;
  vec2 blurStep = vec2(2.0) / u_res;
  float blurred = kx_ink(shadowUV) * 0.4
    + kx_ink(shadowUV + vec2(blurStep.x, 0.0)) * 0.15
    + kx_ink(shadowUV - vec2(blurStep.x, 0.0)) * 0.15
    + kx_ink(shadowUV + vec2(0.0, blurStep.y)) * 0.15
    + kx_ink(shadowUV - vec2(0.0, blurStep.y)) * 0.15;

  // Never shade over the pixel's own ink — the glyph stays crisp and only
  // the page around it darkens.
  float selfInk = kx_ink(v_uv);
  float shadowAlpha = blurred * (1.0 - selfInk) * clamp(u_shadow, 0.0, 1.0) * 0.6;

  // A soft warm disc under the lamp's foot at the top edge, low alpha,
  // brightest directly beneath the lamp and fading out with distance.
  vec2 foot = vec2(lampX, 0.0);
  float footDist = length(px - foot);
  float warmRadius = max(u_swing + 100.0, 1.0);
  float warmAlpha = (1.0 - smoothstep(0.0, warmRadius, footDist)) * 0.14;

  // Composite the two straight-alpha layers (warm cast over shadow) with the
  // usual premultiplied "over", then divide back down to straight alpha for
  // the single non-premultiplied draw.
  vec3 premulShadow = vec3(0.0) * shadowAlpha;
  vec3 premulWarm = u_warm * warmAlpha;
  vec3 premulOut = premulWarm + premulShadow * (1.0 - warmAlpha);
  float alphaOut = warmAlpha + shadowAlpha * (1.0 - warmAlpha);
  vec3 colorOut = alphaOut > 0.0001 ? premulOut / alphaOut : vec3(0.0);

  o_color = vec4(colorOut, alphaOut);
}
`;

type LanternLayerProps = Required<
  Pick<LanternSwayProps, "period" | "swing" | "height" | "shadow" | "warmth">
>;

/** Walks up from the host to the first opaque background colour, so the ink
 * mask reads the page's real background rather than black. The same probe
 * crystal-lens and dust-reveal use for their own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture, the swing clock,
 * and the frame loop; reads everything else from the surface. No pointer
 * listeners — the sway answers to elapsed time alone.
 */
function LanternLayer({
  period,
  swing,
  height,
  shadow,
  warmth,
}: LanternLayerProps) {
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
  const warmRef = React.useRef<[number, number, number]>([1, 0.85, 0.64]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ period, swing, height, shadow });
  React.useEffect(() => {
    paramsRef.current = { period, swing, height, shadow };
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
      u_tick: tickRef.current,
      u_period: p.period,
      u_swing: p.swing,
      u_height: p.height,
      u_shadow: p.shadow,
      u_warm: warmRef.current,
      u_bg: bgRef.current,
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

  // Every completed paint asks for a frame — the texture the shadow reads
  // from just changed.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Background and warmth resolve against the host so a `var(--token)`
  // reads the theme in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    const rgba = resolveColor(warmth, host);
    warmRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, warmth, requestFrame]);

  // The lamp's own clock: a self-scheduling rAF that only exists to advance
  // `u_tick` and redraw every frame while the lantern is on screen and the
  // tab is visible — gated the same way as dust-reveal's idle loop. Under
  // reduced motion this effect never starts, leaving the single still frame
  // drawn above (lamp dead centre) in place.
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
        // Rebase the clock over the pause so the swing resumes, not jumps.
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

  // Reduced motion never starts the clock above, so it never draws its one
  // still frame either — ask for it here instead.
  React.useEffect(() => {
    if (surface.active && !surface.motionSafe) requestFrame();
  }, [surface.active, surface.motionSafe, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="lantern-sway"
      className="block h-full w-full"
    />
  );
}

/**
 * A lantern swings on an unseen line above the interface, and the page's own
 * ink throws a shadow the other way. The lamp's x position is a sine of
 * elapsed time, its height above the plane fixed; every pixel that reads as
 * dark ink against the background gets a softened copy pushed out along the
 * vector away from the lamp, underneath — never over — its own glyph, so text
 * stays legible while its shadow drifts past it. A warm halo pools where the
 * lamp's light would land at the top edge, brightening as the lamp swings
 * over it. Nothing here samples the pointer: the sway is seeded from the rAF
 * clock alone, rebased across any pause, and loops continuously while the
 * lantern is on screen and paused off-screen or when the tab is hidden.
 * Reduced motion: the lamp holds still at the centre, casting one static
 * shadow and glow with no loop.
 */
export function LanternSway({
  period = 5,
  swing = 90,
  height = 320,
  shadow = 0.5,
  warmth = "#ffd9a3",
  paint,
  className,
  children,
}: LanternSwayProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <LanternLayer
          period={period}
          swing={swing}
          height={height}
          shadow={shadow}
          warmth={warmth}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
