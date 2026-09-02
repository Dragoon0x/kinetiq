"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
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

export type HalftoneLensProps = {
  /** Lens radius in CSS pixels. @default 180 */
  radius?: number;
  /** Feather width at the lens edge — 0 is a hard circle. @default 0.5 */
  softness?: number;
  /** The halftone screen's line pitch — cell size in CSS pixels. @default 7 */
  pitch?: number;
  /** Dot-size multiplier over the computed coverage radius. @default 1 */
  gain?: number;
  /** Screen angles in degrees for [cyan, magenta, yellow, black]. @default [15, 75, 0, 45] */
  angles?: [number, number, number, number];
  /** The paper colour the four inks composite over. @default "#f7f4ec" */
  paper?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_pitch;
uniform float u_gain;
uniform vec4 u_angles;
uniform vec4 u_paper;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 hl_sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

vec2 hl_rotate(vec2 v, float angleRad) {
  float s = sin(angleRad);
  float c = cos(angleRad);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// x=c, y=m, z=y, w=k — the naive RGB complement with the shared minimum
// pulled out into K and subtracted back off the other three, so no ink
// screens more than it has to.
vec4 hl_toCmyk(vec3 rgb) {
  float c = 1.0 - rgb.r;
  float m = 1.0 - rgb.g;
  float y = 1.0 - rgb.b;
  float k = min(c, min(m, y));
  return vec4(max(c - k, 0.0), max(m - k, 0.0), max(y - k, 0.0), k);
}

// One ink's dot at screen position px: rotate about the lens centre by this
// ink's own screen angle, find the enclosing pitch-sized cell in that
// rotated space, then sample the source at THAT CELL'S CENTRE (mapped back
// through the inverse rotation) rather than at px — so a dot's size reflects
// the coverage under its own middle, not wherever the fragment lands inside
// it. which selects the CMYK channel this call screens.
float hl_dot(vec2 px, vec2 center, float angleRad, int which) {
  vec2 r = hl_rotate(px - center, angleRad);
  vec2 cell = floor(r / u_pitch) + 0.5;
  vec2 cellCenterRot = cell * u_pitch;
  vec2 cellCenterPx = hl_rotate(cellCenterRot, -angleRad) + center;
  vec4 cmyk = hl_toCmyk(hl_sampleOver(cellCenterPx / u_res));
  float coverage = which == 0 ? cmyk.x : which == 1 ? cmyk.y : which == 2 ? cmyk.z : cmyk.w;
  float dotR = sqrt(clamp(coverage, 0.0, 1.0)) * u_pitch * 0.5 * u_gain;
  float aa = max(u_pitch * 0.1, 0.6);
  float dist = length(r - cellCenterRot);
  return 1.0 - smoothstep(max(dotR - aa, 0.0), dotR + aa, dist);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float feather = max(u_softness, 0.0) * 40.0 + 1.0;
  float edge = 1.0 - smoothstep(R - feather, R + feather, r);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }

  if (u_still > 0.5) {
    // Reduced motion: no screens, only a still outline so the lens reads as
    // a shape without reprinting anything under it.
    float t = clamp(r / R, 0.0, 1.0);
    float ring = smoothstep(0.82, 0.985, t) * (1.0 - smoothstep(0.985, 1.0, t));
    o_color = vec4(vec3(1.0), ring * 0.55 * u_opacity * edge);
    return;
  }

  float covC = hl_dot(px, u_lens.xy, radians(u_angles.x), 0);
  float covM = hl_dot(px, u_lens.xy, radians(u_angles.y), 1);
  float covY = hl_dot(px, u_lens.xy, radians(u_angles.z), 2);
  float covK = hl_dot(px, u_lens.xy, radians(u_angles.w), 3);

  // Multiplicative composite over paper, in CMYK plate order — each ink
  // only ever removes light, it never adds it.
  vec3 ink = u_paper.rgb;
  ink *= mix(vec3(1.0), vec3(0.0, 1.0, 1.0), covC);
  ink *= mix(vec3(1.0), vec3(1.0, 0.0, 1.0), covM);
  ink *= mix(vec3(1.0), vec3(1.0, 1.0, 0.0), covY);
  ink *= mix(vec3(1.0), vec3(0.0, 0.0, 0.0), covK);

  o_color = vec4(ink, u_opacity * edge);
}
`;

type LensLayerProps = Required<
  Pick<
    HalftoneLensProps,
    "radius" | "softness" | "pitch" | "gain" | "angles" | "paper"
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
  pitch,
  gain,
  angles,
  paper,
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
  const paperRef = React.useRef<[number, number, number, number]>([
    0.97, 0.96, 0.93, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, pitch, gain, angles });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, pitch, gain, angles };
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
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_pitch: Math.max(p.pitch, 1),
      u_gain: p.gain,
      u_angles: p.angles,
      u_paper: paperRef.current,
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

  // Paper resolves from a CSS colour (tokens included) so it tracks the live
  // theme; re-resolve whenever the prop or the html class flips.
  React.useEffect(() => {
    const host = surface.host;
    const resolve = () => {
      paperRef.current = resolveColor(paper, host);
      requestFrame();
    };
    resolve();
    if (typeof MutationObserver === "undefined") return;
    const themeObserver = new MutationObserver(resolve);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => themeObserver.disconnect();
  }, [paper, surface.host, requestFrame]);

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
      data-effect-canvas="halftone-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A lens that screens the interface underneath into four rotated ink
 * grids, the way a print shop would separate a photo for plates. The
 * sampled colour converts to CMYK with the shared minimum pulled into K,
 * then each ink — cyan, magenta, yellow, black — gets its own screen
 * angle and its own pitch-sized cells; a cell's dot samples coverage at
 * its own centre, not wherever the fragment lands, so the dot's radius is
 * honest to the patch it represents, then the four inks multiply down onto
 * the paper in plate order. The lens itself is a plain circle that springs
 * to the pointer and fades in and out; nothing under the glass is
 * distorted, only re-printed.
 * Reduced motion: the screens stop; a still lens outline follows the
 * pointer without springing, and no ink prints.
 */
export function HalftoneLens({
  radius = 180,
  softness = 0.5,
  pitch = 7,
  gain = 1,
  angles = [15, 75, 0, 45],
  paper = "#f7f4ec",
  paint,
  className,
  children,
}: HalftoneLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          pitch={pitch}
          gain={gain}
          angles={angles}
          paper={paper}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
