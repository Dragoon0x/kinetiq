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

export type LensFlareProps = {
  /** Luma a pixel must clear to read as a light source (0..1). Governs bright pixels only — inverted dark ink uses its own fixed band. @default 0.85 */
  threshold?: number;
  /** Anamorphic streak reach, in CSS pixels, on each side of a source. @default 160 */
  streak?: number;
  /** Ghost reflections thrown from the host's centre toward the pointer. @default 3 */
  ghosts?: number;
  /** Flare tint. CSS colour, resolved with resolveColor. @default "#cfe3ff" */
  color?: string;
  /** Overall flare strength. @default 0.8 */
  intensity?: number;
  /** Also count dark ink as a light source, tinted to `color` instead of its own near-black. @default true */
  invert?: boolean;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_pointer;
uniform float u_threshold;
uniform float u_streak;
uniform int u_ghosts;
uniform vec3 u_color;
uniform float u_intensity;
uniform float u_invert;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const int MAX_GHOSTS = 8;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// The bright mask "b": the sampled colour, gated to pixels that read as a
// light source. A light page is bright everywhere, so pixels within 0.05 of
// u_bg are excluded first — otherwise the whole background would flare.
// Bright type, seals and saturated fills pass on u_threshold, which is
// tuned for near-1.0 pixels. Dark ink, when u_invert is on, gets its OWN
// fixed band instead of reusing u_threshold inverted: ordinary body-text
// luma (roughly 0.1-0.3) almost never cleared a threshold meant for
// near-white pixels, which is why a light page previously flared nothing
// at all. Ink glows at u_color, full strength — multiplying it by its own
// near-black would erase it right back to nothing.
vec3 sampleBright(vec2 uv) {
  vec3 col = sampleOver(uv);
  float th = clamp(u_threshold, 0.0, 0.99);
  float luma = kx_luma(col);
  float notBg = smoothstep(0.0, 0.05, distance(col, u_bg.rgb));
  float brightSource = smoothstep(th, 1.0, luma);
  float inkSource = u_invert > 0.5 ? smoothstep(0.35, 0.8, 1.0 - luma) : 0.0;
  float mask = max(brightSource, inkSource) * notBg;
  vec3 source = inkSource > brightSource ? u_color : col;
  return mask * source;
}

// Anamorphic streak: a bright source smears sideways the way a cylindrical
// lens element spreads a highlight along one axis. The fragment's own
// sample carries full weight (falloff 1); sixteen taps each side add in
// with linear falloff. Full coverage sums to 16 (1 centre + 15 per side,
// both sides): dividing by 20 puts a solid, fully-covered run of source
// pixels at ~0.8 before intensity.
vec3 streakSum(vec2 px) {
  vec3 acc = sampleBright(px / u_res);
  float reach = max(u_streak, 0.0);
  for (int i = 1; i <= 16; i++) {
    float t = float(i) / 16.0;
    float d = reach * t;
    float falloff = 1.0 - t;
    acc += sampleBright((px + vec2(d, 0.0)) / u_res) * falloff;
    acc += sampleBright((px - vec2(d, 0.0)) / u_res) * falloff;
  }
  return acc / 20.0;
}

// Ghosts: the secondary reflections a lens throws opposite its light
// source. This fragment's own mirror through the host centre is that
// reflection point; ghost i walks a fraction i/ghosts of the way from the
// mirror toward the pointer, sampling the bright mask there. A four-tap
// cross around the sample keeps each one a soft disc rather than a bare
// point — skipped under u_still, since a frozen frame does not need it.
vec3 ghostSum(vec2 px) {
  int count = clamp(u_ghosts, 0, MAX_GHOSTS);
  if (count == 0) return vec3(0.0);
  vec3 acc = vec3(0.0);
  vec2 centre = u_res * 0.5;
  vec2 mirror = centre * 2.0 - px;
  vec2 texel = 1.0 / u_res;
  for (int i = 1; i <= MAX_GHOSTS; i++) {
    if (i > count) break;
    float t = float(i) / float(count);
    vec2 samplePx = mix(mirror, u_pointer, t);
    vec2 sampleUv = samplePx / u_res;
    vec3 s = sampleBright(sampleUv);
    if (u_still < 0.5) {
      vec2 e = texel * 2.0;
      s += sampleBright(sampleUv + vec2(e.x, 0.0));
      s += sampleBright(sampleUv - vec2(e.x, 0.0));
      s += sampleBright(sampleUv + vec2(0.0, e.y));
      s += sampleBright(sampleUv - vec2(0.0, e.y));
      s *= 0.2;
    }
    acc += s;
  }
  return acc / float(count);
}

// Bloom: a soft nine-tap (3x3) blur of the bright mask — the diffuse haze
// around every source. Same calibration as the streak: dividing the nine
// taps by 11.25 (9 / 0.8) puts a solid, fully-covered patch at ~0.8 before
// intensity too.
vec3 bloomSum(vec2 px) {
  vec3 acc = vec3(0.0);
  vec2 texel = 3.0 / u_res;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      acc += sampleBright(px / u_res + vec2(float(x), float(y)) * texel);
    }
  }
  return acc / 11.25;
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 streaks = streakSum(px);
  vec3 ghosts = ghostSum(px);
  vec3 bloom = bloomSum(px);
  float strength = kx_luma(streaks) + kx_luma(ghosts) + kx_luma(bloom);
  vec3 tint = mix(vec3(1.0), u_color, 0.65);
  // clamp(intensity * strength, 0, 1) is the flare's own visibility
  // ceiling; u_opacity is the separate hover fade in/out, applied outside
  // the clamp so the flare still fades to nothing when the pointer leaves.
  float alpha = clamp(u_intensity * strength, 0.0, 1.0) * u_opacity;
  o_color = vec4(tint, alpha);
}
`;

type LensLayerProps = Required<
  Pick<
    LensFlareProps,
    "threshold" | "streak" | "ghosts" | "color" | "intensity" | "invert"
  >
>;

/** Walks up from the host to the first opaque background colour, so a
 * source composited over transparent texture regions reads over the page
 * rather than over black. Mirrors crystal-lens's effectiveBackground. */
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
  threshold,
  streak,
  ghosts,
  color,
  intensity,
  invert,
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
  const colorRef = React.useRef<[number, number, number, number]>([
    0.81, 0.89, 1, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    threshold,
    streak,
    ghosts,
    intensity,
    invert,
  });
  React.useEffect(() => {
    paramsRef.current = { threshold, streak, ghosts, intensity, invert };
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
      u_threshold: p.threshold,
      u_streak: p.streak,
      u_ghosts: Math.round(p.ghosts),
      u_color: [colorRef.current[0], colorRef.current[1], colorRef.current[2]],
      u_intensity: p.intensity,
      u_invert: p.invert ? 1 : 0,
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

  // Resolve the tint through the real cascade, so a token like
  // var(--accent-bright) reads the theme in force on the host.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: spring the source toward it on `glide`, fade the
  // whole flare in and out.
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
        animate(x, px, springs.glide);
        animate(y, py, springs.glide);
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
      data-effect-canvas="lens-flare"
      className="block h-full w-full"
    />
  );
}

/**
 * An anamorphic flare that reads the interface's own brightest pixels as
 * its light sources, never a synthetic sun. A per-pixel mask keeps type,
 * seals and saturated fills that clear `threshold`, drops anything within
 * 0.05 of the host's own background so a light page cannot flare itself,
 * and — when `invert` is on — treats dark ink the same way, tinted to
 * `color` so it glows instead of vanishing into its own near-black. That
 * mask streaks sideways sixteen taps a side, throws `ghosts` soft
 * reflections along the line from each pixel's mirror through the host's
 * centre toward the pointer, and blurs into a nine-tap bloom; the three sum
 * into one additive, white-toward-`color` glow, sprung after the pointer on
 * `springs.glide`. Reduced motion: the same flare renders in full, but the
 * pointer jumps straight to its position instead of springing, so nothing
 * moves once it lands.
 */
export function LensFlare({
  threshold = 0.85,
  streak = 160,
  ghosts = 3,
  color = "#cfe3ff",
  intensity = 0.8,
  invert = true,
  paint,
  className,
  children,
}: LensFlareProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <LensLayer
          threshold={threshold}
          streak={streak}
          ghosts={ghosts}
          color={color}
          intensity={intensity}
          invert={invert}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
