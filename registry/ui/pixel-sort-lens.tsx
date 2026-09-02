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

export type PixelSortAxis = "x" | "y";

export type PixelSortLensProps = {
  /** Lens radius in CSS pixels. @default 180 */
  radius?: number;
  /** Feather width at the rim, as a fraction of the radius (0..1). @default 0.5 */
  softness?: number;
  /** The direction each pixel reaches ahead along. @default "x" */
  axis?: PixelSortAxis;
  /** The length of one sort band, in CSS pixels — how far a run can reach before it resets. @default 140 */
  length?: number;
  /** Luminance above which a pixel takes the brightest tap instead of the darkest (0..1). @default 0.5 */
  threshold?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform int u_axis;
uniform float u_length;
uniform float u_threshold;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const int TAPS = 24;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float feather = clamp(u_softness, 0.0, 1.0) * R;
  float mask = 1.0 - smoothstep(max(R - feather, 0.0), R, r);
  // A thin band just inside the boundary, entirely within the circle, so
  // the lens still reads as a shape where nothing beneath it has contrast
  // to sort.
  float rim = smoothstep(R - 3.0, R - 1.5, r) * (1.0 - smoothstep(R - 1.5, R, r));
  if (mask <= 0.0 && rim <= 0.0) { o_color = vec4(0.0); return; }

  if (u_still > 0.5) {
    // Reduced motion: no sorting, only a still outline so the lens is
    // legible as a shape without moving anything under it.
    o_color = vec4(vec3(1.0), rim * 0.6 * u_opacity);
    return;
  }

  vec2 axisDir = u_axis == 1 ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
  float axisPx = u_axis == 1 ? px.y : px.x;
  float bandLen = max(u_length, 1.0);
  // Runs build across a length-px band and reset at its edge: a pixel near
  // the start of its band reaches almost nowhere, one near the end reaches
  // nearly the full length — that ramp is what reads as a streak.
  float bandT = fract(axisPx / bandLen);

  vec3 ownColor = vec3(0.0);
  float ownLuma = 0.0;
  vec3 brightest = vec3(0.0);
  float brightestLuma = -1.0;
  vec3 darkest = vec3(0.0);
  float darkestLuma = 2.0;

  for (int i = 0; i < TAPS; i++) {
    float t = float(i) / float(TAPS - 1);
    float dist = t * bandLen * bandT;
    vec3 c = sampleOver((px + axisDir * dist) / u_res);
    float l = kx_luma(c);
    if (i == 0) {
      ownColor = c;
      ownLuma = l;
    }
    if (l > brightestLuma) { brightestLuma = l; brightest = c; }
    if (l < darkestLuma) { darkestLuma = l; darkest = c; }
  }

  vec3 sorted = ownLuma > u_threshold ? brightest : darkest;
  // Flat patches sample nearly the same luminance everywhere along the
  // reach, so contrast collapses toward zero and the mix falls back to the
  // true colour — only real edges break into a visible run.
  float contrast = clamp(brightestLuma - darkestLuma, 0.0, 1.0);
  vec3 c = mix(ownColor, sorted, smoothstep(0.0, 0.3, contrast));
  vec3 outColor = mix(c, vec3(1.0), rim * 0.4);

  float alpha = clamp(mask * u_opacity + rim * u_opacity * 0.5, 0.0, 1.0);
  o_color = vec4(outColor, alpha);
}
`;

type LensLayerProps = Required<
  Pick<
    PixelSortLensProps,
    "radius" | "softness" | "axis" | "length" | "threshold"
  >
>;

/** Walks up from the host to the first opaque background colour, so lens
 * samples over transparent texture regions composite onto the page rather
 * than onto black. */
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
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function LensLayer({
  radius,
  softness,
  axis,
  length,
  threshold,
}: LensLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);

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
  const paramsRef = React.useRef({
    radius,
    softness,
    axisIndex: axis === "y" ? 1 : 0,
    length,
    threshold,
  });
  React.useEffect(() => {
    paramsRef.current = {
      radius,
      softness,
      axisIndex: axis === "y" ? 1 : 0,
      length,
      threshold,
    };
  }, [radius, softness, axis, length, threshold]);

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
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_axis: p.axisIndex,
      u_length: p.length,
      u_threshold: p.threshold,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, opacity]);

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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, opacity].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: spring the lens, fade in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      if (still) opacity.set(0);
      else animate(opacity, 0, { duration: 0.22 });
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, x, y, opacity]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="pixel-sort-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A lens that follows the cursor and streaks the interface beneath it into a
 * one-pass approximation of pixel sorting: every pixel inside the glass
 * probes 24 samples ahead of itself along `axis`, then takes the brightest
 * sample's colour when its own luminance clears `threshold` and the darkest
 * one otherwise. Each sample reaches further the deeper the pixel sits
 * within its `length`-px band, so a whole band builds into a streak before
 * the next one resets. The result blends back toward the true colour by how
 * much the samples actually disagreed, so a flat patch of the interface has
 * nothing to sort and stays flat — only real edges streak. The DOM
 * underneath stays real: every control still clicks and focuses through the
 * glass, since the shader only ever draws over it. A thin rim marks the
 * boundary so the lens reads as a shape even where nothing beneath it has
 * contrast to sort.
 * Reduced motion: a still lens outline follows the pointer without
 * springing, and nothing sorts.
 */
export function PixelSortLens({
  radius = 180,
  softness = 0.5,
  axis = "x",
  length = 140,
  threshold = 0.5,
  paint,
  className,
  children,
}: PixelSortLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          axis={axis}
          length={length}
          threshold={threshold}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
