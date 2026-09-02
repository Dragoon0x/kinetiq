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

export type CrystalLensProps = {
  /** Lens radius in CSS pixels. @default 140 */
  radius?: number;
  /** Magnification at the centre; the rim always returns to 1. @default 1.6 */
  zoom?: number;
  /** How hard the rim bends the image inward (0..1). @default 0.35 */
  refraction?: number;
  /** Colour-fringe strength at the rim (0..1). @default 0.35 */
  dispersion?: number;
  /** Frosted blur along the rim (0..1). @default 0.15 */
  frost?: number;
  /** A selector for elements the lens zooms on while the pointer is over them. */
  targets?: string;
  /** Extra magnification applied over a target. @default 1.35 */
  targetZoom?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_zoom;
uniform float u_refraction;
uniform float u_dispersion;
uniform float u_frost;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float edge = 1.0 - smoothstep(R - 1.5, R + 0.5, r);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }
  float t = clamp(r / R, 0.0, 1.0);
  vec2 dir = r > 0.0 ? d / r : vec2(0.0);
  float ring = smoothstep(0.82, 0.985, t) * (1.0 - smoothstep(0.985, 1.0, t));

  if (u_still > 0.5) {
    // Reduced motion: no optics, only a still outline so the lens is
    // legible as a shape without moving anything under it.
    o_color = vec4(vec3(1.0), ring * 0.55 * u_opacity * edge);
    return;
  }

  float mag = 1.0 / mix(u_zoom, 1.0, t * t);
  float bend = u_refraction * t * t;
  vec2 src = u_lens.xy + d * mag * (1.0 - bend);
  float disp = u_dispersion * 7.0 * t * t;
  vec3 c = vec3(
    sampleOver((src + dir * disp) / u_res).r,
    sampleOver(src / u_res).g,
    sampleOver((src - dir * disp) / u_res).b
  );

  float frostR = u_frost * 7.0 * smoothstep(0.55, 1.0, t);
  if (frostR > 0.25) {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = 6.2831853 * float(i) / 8.0;
      vec2 off = vec2(cos(a), sin(a)) * frostR;
      acc += sampleOver((src + off) / u_res);
    }
    c = mix(c, acc / 8.0, smoothstep(0.55, 1.0, t));
  }

  // Rim shading and a specular glint on the upper-left shoulder.
  float shade = 1.0 - 0.22 * smoothstep(0.7, 1.0, t);
  vec2 light = normalize(vec2(-0.6, -0.8));
  float glint = pow(max(dot(dir, light), 0.0), 18.0) * smoothstep(0.6, 0.95, t) * 0.35;
  c = c * shade + glint;
  o_color = vec4(c, u_opacity * edge);
}
`;

type LensLayerProps = Required<
  Pick<
    CrystalLensProps,
    "radius" | "zoom" | "refraction" | "dispersion" | "frost" | "targetZoom"
  >
> & { targets?: string };

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
  zoom,
  refraction,
  dispersion,
  frost,
  targets,
  targetZoom,
}: LensLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);
  const zoomLevel = useMotionValue<number>(zoom);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const targetRectsRef = React.useRef<DOMRect[]>([]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    radius,
    zoom,
    refraction,
    dispersion,
    frost,
  });
  React.useEffect(() => {
    paramsRef.current = { radius, zoom, refraction, dispersion, frost };
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
      u_zoom: zoomLevel.get(),
      u_refraction: p.refraction,
      u_dispersion: p.dispersion,
      u_frost: p.frost,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, opacity, zoomLevel]);

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
    const unsubs = [x, y, opacity, zoomLevel].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, zoomLevel, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: spring the lens, resolve targets, fade in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const refreshTargets = () => {
      if (!targets) {
        targetRectsRef.current = [];
        return;
      }
      const hostRect = host.getBoundingClientRect();
      targetRectsRef.current = [...host.querySelectorAll(targets)].map((el) => {
        const r = el.getBoundingClientRect();
        return new DOMRect(
          r.left - hostRect.left,
          r.top - hostRect.top,
          r.width,
          r.height,
        );
      });
    };
    refreshTargets();

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
      const over = targetRectsRef.current.some(
        (r) => px >= r.left && px <= r.right && py >= r.top && py <= r.bottom,
      );
      const wanted = over
        ? paramsRef.current.zoom * targetZoom
        : paramsRef.current.zoom;
      if (Math.abs(zoomLevel.get() - wanted) > 0.001) {
        if (still) zoomLevel.set(wanted);
        else animate(zoomLevel, wanted, springs.glide);
      }
    };
    const enter = (event: PointerEvent) => {
      refreshTargets();
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
  }, [surface.host, targets, targetZoom, x, y, opacity, zoomLevel]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="crystal-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A lens that follows the cursor and refracts the live interface like a
 * crystal ball: the texture bends toward the centre, the rim disperses
 * into colour fringes, and a touch of frost softens the edge. Hover a
 * target — a heading, a control — and the lens zooms on it. Everything
 * under the glass is the real DOM: links click, fields focus, and the
 * painter's focus ring bends with the rest. The optics are one fragment
 * shader over the painted texture; the lens position is a spring on the
 * wrapper's pointer, never on the canvas.
 * Reduced motion: the page shows undistorted with a still lens outline
 * that follows the pointer without springing.
 */
export function CrystalLens({
  radius = 140,
  zoom = 1.6,
  refraction = 0.35,
  dispersion = 0.35,
  frost = 0.15,
  targets,
  targetZoom = 1.35,
  paint,
  className,
  children,
}: CrystalLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          zoom={zoom}
          refraction={refraction}
          dispersion={dispersion}
          frost={frost}
          targets={targets}
          targetZoom={targetZoom}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
