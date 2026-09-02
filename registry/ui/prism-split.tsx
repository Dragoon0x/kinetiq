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

export type PrismSplitProps = {
  /** Maximum lateral offset applied to the outermost spectral bands, in CSS pixels. @default 14 */
  spread?: number;
  /** Distance in CSS pixels over which the split ramps from nothing at the pointer up to full `spread`. @default 700 */
  falloff?: number;
  /** Spectral bands the texture is split into, red through green to violet. @default 8 */
  bands?: number;
  /** Fill for regions where the painted texture is transparent. Defaults to the host's own effective background. */
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
uniform float u_spread;
uniform float u_falloff;
uniform int u_bands;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A simplified wavelength ramp, three anchor stops: red through green to
// violet (not the full rainbow).
vec3 spectralTint(float t) {
  vec3 red = vec3(0.95, 0.16, 0.14);
  vec3 green = vec3(0.16, 0.85, 0.35);
  vec3 violet = vec3(0.52, 0.20, 0.98);
  return t < 0.5
    ? mix(red, green, t * 2.0)
    : mix(green, violet, (t - 0.5) * 2.0);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 delta = px - u_pointer;
  float dist = length(delta);
  vec2 dir = dist > 0.0001 ? delta / dist : vec2(1.0, 0.0);

  float falloff = max(u_falloff, 1.0);
  float spread = u_spread * smoothstep(0.0, falloff, dist);
  // The split collapses to exactly zero well inside the outer falloff, so
  // a guaranteed sharp disc of the real page sits under the pointer.
  float sharp = 1.0 - smoothstep(0.0, falloff * 0.2, dist);
  float s = spread * (1.0 - sharp);

  int bands = clamp(u_bands, 1, 32);
  float divisor = max(float(bands) - 1.0, 1.0);

  // Every band samples the texture off-centre along the pointer axis and
  // is weighted by its own spectral tint; dividing the weighted colour sum
  // by the tint sum (per channel) keeps the average colour exact — when
  // s is 0 every band lands on the same texel and the division cancels
  // out to that texel's true colour, no matter how the tints differ.
  vec3 colorSum = vec3(0.0);
  vec3 tintSum = vec3(0.0);
  for (int i = 0; i < bands; i++) {
    float t = float(i) / divisor;
    float offset = s * (t - 0.5) * 2.0;
    vec3 tint = spectralTint(t);
    colorSum += sampleOver((px - dir * offset) / u_res) * tint;
    tintSum += tint;
  }
  vec3 color = colorSum / max(tintSum, vec3(0.0001));
  o_color = vec4(color, 1.0);
}
`;

type PrismLayerProps = Required<
  Pick<PrismSplitProps, "spread" | "falloff" | "bands">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent region composites onto the page rather
 * than onto black — the same probe crystal-lens and warp-grid use for
 * their own backdrops. */
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
    document.documentElement,
  );
}

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function PrismLayer({ spread, falloff, bands, background }: PrismLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Off-screen at rest: distance to every on-screen pixel is then far past
  // `falloff`, so the page starts fully split, the same rest state the
  // pointer glides back to on leave.
  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);

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
  const paramsRef = React.useRef({ spread, falloff, bands });
  React.useEffect(() => {
    paramsRef.current = { spread, falloff, bands };
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
      u_pointer: [x.get(), y.get()],
      u_spread: p.spread,
      u_falloff: p.falloff,
      u_bands: Math.round(p.bands),
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y]);

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

  // Every pointer-spring tick and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours are resolved against the host once it exists, and again if the
  // caller changes `background` — `var(--token)` needs the host's computed
  // style to read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Pointer on the host: the split's origin springs onto the pointer on
  // `glide`, and glides back off-screen on leave, so the page settles back
  // to the same fully split rest state it started in.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      animate(x, px, springs.glide);
      animate(y, py, springs.glide);
    };
    const leave = () => {
      animate(x, -9999, springs.glide);
      animate(y, -9999, springs.glide);
    };

    host.addEventListener("pointerenter", move);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="prism-split"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as if it were seen through a prism: every pixel is redrawn
 * as `bands` copies of itself, each pulled sideways along the line from the
 * pointer by a distance that grows with `falloff` and tops out at `spread`.
 * Far from the pointer the copies separate into visible red-to-violet
 * fringing; each copy's spectral tint is divided back out of the sum so the
 * average colour never drifts, and the offset itself collapses to zero
 * right under the pointer, leaving a small sharp disc of the real page.
 * Nothing is simulated — the split is a pure function of distance to the
 * pointer, recomputed every frame — so the page starts (and, once the
 * pointer leaves, settles back to) fully split, and the pointer opens a
 * moving window of clarity into it. The pointer position itself rides a
 * `glide` spring, so the window trails a beat behind a fast sweep.
 * Reduced motion: `SurfacePaint` renders in replace mode, so the layer
 * returns null and the real, undistorted DOM shows in its place.
 */
export function PrismSplit({
  spread = 14,
  falloff = 700,
  bands = 8,
  background,
  paint,
  className,
  children,
}: PrismSplitProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PrismLayer
          spread={spread}
          falloff={falloff}
          bands={bands}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
