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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type FocusPullProps = {
  /** Sharp-focus radius in CSS pixels around the pointer. @default 140 */
  radius?: number;
  /** Distance in CSS pixels, starting at `radius`, over which the blur ramps from 0 up to `maxBlur`. @default 220 */
  falloff?: number;
  /** Poisson-disc blur radius in CSS pixels once the falloff is fully spent. @default 6 */
  maxBlur?: number;
  /** Strength of the bloom bled from blurred bright regions, scaled by how defocused that pixel is. @default 0.4 */
  bloom?: number;
  /** Fill for wherever the painted texture is transparent. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_pointer;
uniform float u_radius;
uniform float u_falloff;
uniform float u_maxBlur;
uniform float u_bloom;
uniform float u_reveal;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A 13-point Vogel spiral in the unit disc — an even spread with no
// repeating ring the way a fixed-angle fan of taps would show.
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

// One tap: the plain page sample, or — for the bloom pass — that sample
// gated by how far its luma sits past the bright threshold, so only the
// interface's own highlights ever bleed.
vec3 kx_tap(vec2 uv, bool bright) {
  vec3 c = sampleOver(uv);
  if (bright) {
    return c * smoothstep(0.75, 1.0, kx_luma(c));
  }
  return c;
}

// Variable-radius Poisson blur. Below half a pixel of spread the disc would
// only resample the same texel thirteen times, so it collapses to one tap.
vec3 kx_blur(vec2 px, float r, bool bright) {
  if (r < 0.5) return kx_tap(px / u_res, bright);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 13; i++) {
    acc += kx_tap((px + kx_poisson13[i] * r) / u_res, bright);
  }
  return acc / 13.0;
}

void main() {
  vec2 px = v_uv * u_res;
  float dist = distance(px, u_pointer);
  float edge = max(u_falloff, 0.001);
  float b = u_maxBlur * u_reveal * smoothstep(u_radius, u_radius + edge, dist);

  vec3 color = kx_blur(px, b, false);
  vec3 glow = kx_blur(px, b * 2.0, true);
  color += glow * u_bloom * (b / max(u_maxBlur, 0.0001));

  o_color = vec4(color, 1.0);
}
`;

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black. Mirrors crystal-lens's and bloom-halo's own probe. */
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

type FocusPullLayerProps = Required<
  Pick<FocusPullProps, "radius" | "falloff" | "maxBlur" | "bloom">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the page texture, the
 * pointer and reveal springs, and the frame loop; reads everything else
 * from the surface.
 */
function FocusPullLayer({
  radius,
  falloff,
  maxBlur,
  bloom,
  background,
}: FocusPullLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const reveal = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, falloff, maxBlur, bloom });
  React.useEffect(() => {
    paramsRef.current = { radius, falloff, maxBlur, bloom };
  });

  // One frame: upload the texture if a new paint landed, then draw the
  // blur at wherever the pointer and reveal springs currently sit.
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
      u_pointer: [x.get(), y.get()],
      u_radius: p.radius,
      u_falloff: p.falloff,
      u_maxBlur: p.maxBlur,
      u_bloom: p.bloom,
      u_reveal: reveal.get(),
      u_bg: bg,
    });
    tri.draw();
  }, [x, y, reveal]);

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

  // Every motion-value change and every completed paint asks for a frame —
  // the pointer and reveal springs settling stops firing "change" on their
  // own, which is what stops the loop; nothing here schedules a frame
  // unasked.
  React.useEffect(() => {
    const unsubs = [x, y, reveal].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, reveal, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The background fill is resolved against the host once it exists, and
  // again if the caller changes it — it may be a `var(--token)`.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Pointer on the host: jump the lens to the pointer on entry so it never
  // sweeps in from the offscreen sentinel, spring it there on every move,
  // and spring `reveal` up on enter / down on leave — everything sharp
  // while the pointer is away, the blur only lifting once it settles in.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      animate(reveal, 1, springs.glide);
    };
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.glide);
      animate(y, event.clientY - rect.top, springs.glide);
    };
    const leave = () => {
      animate(reveal, 0, springs.glide);
    };

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.active, surface.host, x, y, reveal]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="focus-pull"
      className="block h-full w-full"
    />
  );
}

/**
 * A shallow depth of field over the live interface: a Poisson-disc blur
 * whose radius grows from zero at the pointer out to `maxBlur` past
 * `radius + falloff`, so a ring under the cursor stays sharp while the rest
 * of the page softens. A `reveal` spring keeps the whole page in focus while
 * the pointer is away and only lifts the blur once it has settled inside
 * the host, so nothing softens on load or on a passing sweep. The blur's
 * own bright pixels feed a second, wider pass at the same thirteen taps — a
 * bloom that grows with the defocus, the way an out-of-focus highlight
 * blooms through real glass. The canvas is the page: `SurfacePaint` renders
 * the real DOM at zero opacity beneath it, and the shader fills fully
 * transparent texture regions with the host's effective background (or the
 * `background` prop).
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function FocusPull({
  radius = 140,
  falloff = 220,
  maxBlur = 6,
  bloom = 0.4,
  background,
  paint,
  className,
  children,
}: FocusPullProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FocusPullLayer
          radius={radius}
          falloff={falloff}
          maxBlur={maxBlur}
          bloom={bloom}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
