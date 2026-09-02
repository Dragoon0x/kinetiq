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
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type BloomHaloProps = {
  /** Luma above which a tone counts as bright enough to bloom (0..1). @default 0.8 */
  threshold?: number;
  /** Base blur radius in CSS pixels, before the pointer's swell. @default 22 */
  radius?: number;
  /** Strength the blurred bloom is added back to the page at. @default 0.9 */
  intensity?: number;
  /** Extra radius multiplier the blur reaches at the pointer's centre. @default 1.2 */
  swell?: number;
  /** Distance in CSS pixels over which the pointer's swell falls off to nothing. @default 260 */
  reach?: number;
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
uniform float u_threshold;
uniform float u_radius;
uniform float u_intensity;
uniform float u_swell;
uniform float u_reach;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// HSL saturation of a display colour: 0 for greys, up to 1 for a pure hue,
// independent of how light or dark the colour sits.
float kx_saturation(vec3 c) {
  float maxc = max(c.r, max(c.g, c.b));
  float minc = min(c.r, min(c.g, c.b));
  float d = maxc - minc;
  if (d < 0.0001) return 0.0;
  float l = (maxc + minc) * 0.5;
  return d / (1.0 - abs(2.0 * l - 1.0) + 0.0001);
}

// What one sample contributes to the bloom before it is blurred: its own
// colour, gated by how far past threshold its luma sits, plus its colour
// again gated by how saturated it is — so a seal or the primary button
// blooms even on a page where nothing is near-white. The luma gate excludes
// tones within 0.04 of the page background, so on a light page the ground
// itself never reads as a bright surface to bloom.
vec3 kx_bloomSeed(vec2 uv) {
  vec3 base = sampleOver(uv);
  float luma = kx_luma(base);
  float th = min(u_threshold, 0.999);
  float nearBg = smoothstep(0.0, 0.04, distance(base, u_bg.rgb));
  float brightAmt = smoothstep(th, 1.0, luma) * nearBg;
  float satAmt = smoothstep(0.35, 0.8, kx_saturation(base));
  return base * clamp(brightAmt + satAmt, 0.0, 1.0);
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

void main() {
  vec2 px = v_uv * u_res;
  vec3 base = sampleOver(v_uv);

  float dist = distance(px, u_pointer);
  float falloff = 1.0 - smoothstep(0.0, max(u_reach, 1.0), dist);
  float r = u_radius * (1.0 + u_swell * falloff);

  vec3 bloom = vec3(0.0);
  for (int i = 0; i < 13; i++) {
    vec2 offset = kx_poisson13[i] * r;
    bloom += kx_bloomSeed((px + offset) / u_res);
  }
  bloom /= 13.0;

  vec3 color = base + bloom * u_intensity;
  o_color = vec4(color, 1.0);
}
`;

/** Walks up from the host to the first opaque background colour, so a
 * bloom sample over a transparent texture region composites onto the page
 * rather than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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

type BloomHaloLayerProps = Required<
  Pick<BloomHaloProps, "threshold" | "radius" | "intensity" | "swell" | "reach">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the page texture, the
 * pointer spring, and the frame loop; reads everything else from the
 * surface.
 */
function BloomHaloLayer({
  threshold,
  radius,
  intensity,
  swell,
  reach,
  background,
}: BloomHaloLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

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
  const paramsRef = React.useRef({
    threshold,
    radius,
    intensity,
    swell,
    reach,
  });
  React.useEffect(() => {
    paramsRef.current = { threshold, radius, intensity, swell, reach };
  });

  // One frame: upload the texture if a new paint landed, then draw the
  // bloom at wherever the pointer spring currently sits.
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
      u_threshold: p.threshold,
      u_radius: p.radius,
      u_intensity: p.intensity,
      u_swell: p.swell,
      u_reach: p.reach,
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

  // Every motion-value change and every completed paint asks for a frame —
  // the pointer spring settling stops firing "change" on its own, which is
  // what stops the loop; nothing here schedules a frame unasked.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

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

  // Pointer on the host: spring the bloom's centre toward it on `glide`.
  // Entering jumps straight to the pointer so the bloom never sweeps in
  // from off-screen; leaving springs the centre back off-screen so the
  // swell recedes to the ambient bloom instead of sticking at its last
  // spot — the spring settling there is what stops the loop.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
    };
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.glide);
      animate(y, event.clientY - rect.top, springs.glide);
    };
    const leave = () => {
      animate(x, -9999, springs.glide);
      animate(y, -9999, springs.glide);
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
  }, [surface.active, surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="bloom-halo"
      className="block h-full w-full"
    />
  );
}

/**
 * A soft bloom seeded from the interface's own brightest and most saturated
 * tones — near-white text, a status seal, the primary button — blurred with
 * a 13-tap Poisson disc and added back over the page. The blur radius grows
 * near the pointer, out to `reach` CSS pixels, so the halo visibly gathers
 * wherever the cursor rests without ever touching layout. A light page's
 * own background is excluded from the bright mask (it sits within 0.04 of
 * `u_bg`), so the ground never blooms on its own account. The canvas is the
 * page: `SurfacePaint` renders the real DOM at zero opacity beneath it, and
 * the shader fills fully transparent texture regions with the host's
 * effective background (or the `background` prop) before adding the glow.
 * Reduced motion: `SurfacePaint`'s replace-mode contract handles it — the
 * real DOM shows at full opacity and this layer renders nothing.
 */
export function BloomHalo({
  threshold = 0.8,
  radius = 22,
  intensity = 0.9,
  swell = 1.2,
  reach = 260,
  background,
  paint,
  className,
  children,
}: BloomHaloProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <BloomHaloLayer
          threshold={threshold}
          radius={radius}
          intensity={intensity}
          swell={swell}
          reach={reach}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
