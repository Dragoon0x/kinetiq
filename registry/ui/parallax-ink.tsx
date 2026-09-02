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

export type ParallaxInkProps = {
  /** Maximum parallax offset of the nearest depth layer, in CSS pixels. @default 10 */
  shift?: number;
  /** Depth bands composited from far to near (1 to 4 — the loop is bounded at 4). @default 3 */
  layers?: number;
  /** Strength of the shadow the nearest layer casts on what sits behind it (0..1). @default 0.35 */
  shadow?: number;
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
uniform float u_shift;
uniform highp int u_layers;
uniform float u_shadow;
uniform float u_reveal;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// How much a point reads as drawn ink rather than empty page. Compositing
// over u_bg first means a fully transparent sample and a sample that only
// happens to match the page colour both land at distance 0 from u_bg, so
// one check away from the background covers "transparent" and "painted
// the same tone as the page" at once.
float kx_mask(vec2 uv) {
  vec3 c = sampleOver(uv);
  float ink = smoothstep(0.3, 0.85, 1.0 - kx_luma(c));
  float nearBg = smoothstep(0.0, 0.04, distance(c, u_bg.rgb));
  return ink * nearBg;
}

// A 13-point Vogel spiral in the unit disc, matching bloom-halo's blur —
// an even spread with no repeating ring a fixed-angle fan of taps would
// show.
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

// The ink mask blurred over a 12px disc at the given point. A thin rule
// blurs down toward almost nothing; a solid heading or a filled seal
// stays close to 1 — so this value reads as feature size, and feature
// size is what sorts a mark into a depth band below.
float kx_coarseMask(vec2 uv) {
  float acc = 0.0;
  for (int i = 0; i < 13; i++) {
    acc += kx_mask(uv + kx_poisson13[i] * 12.0 / u_res);
  }
  return acc / 13.0;
}

void main() {
  vec2 px = v_uv * u_res;
  // Pointer offset from the canvas centre, normalised by the half-res so
  // it stays a small, resolution-independent fraction, then scaled to
  // pixels by u_shift and gated by u_reveal — zero the moment the pointer
  // is away, so the whole page settles flat instead of freezing mid-drift.
  vec2 o = (u_pointer - u_res * 0.5) / (u_res * 0.5) * u_shift * u_reveal;

  float mHere = kx_mask(v_uv);
  vec3 ground = sampleOver(v_uv);
  vec3 result = mix(u_bg.rgb, ground, 1.0 - mHere);

  int layers = max(u_layers, 1);
  for (int k = 0; k < 4; k++) {
    if (k >= layers) break;
    float d = float(k) / max(float(layers - 1), 1.0);
    vec2 sampleUv = (px - o * d) / u_res;
    vec3 pageColor = sampleOver(sampleUv);
    float mK = kx_mask(sampleUv);
    float cK = kx_coarseMask(sampleUv);
    float lo = float(k) / float(layers);
    float hi = float(k + 1) / float(layers);
    float membership = smoothstep(lo - 0.05, lo, cK) * (1.0 - smoothstep(hi, hi + 0.05, cK));
    result = mix(result, pageColor, membership * mK);
  }

  // The nearest layer's coarse silhouette, shifted a few pixels toward
  // the light, darkens whatever sits behind it — never the ink itself.
  vec2 shadowUv = (px - o - vec2(4.0, 6.0)) / u_res;
  float shadowAmt = clamp(u_shadow * kx_coarseMask(shadowUv) * (1.0 - mHere), 0.0, 1.0);
  result *= (1.0 - shadowAmt);

  o_color = vec4(result, 1.0);
}
`;

/** Walks up from the host to the first opaque background colour, so a
 * depth-layer sample over a transparent texture region composites onto
 * the page rather than onto black. Mirrors bloom-halo's
 * effectiveBackground. */
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

type ParallaxInkLayerProps = Required<
  Pick<ParallaxInkProps, "shift" | "layers" | "shadow">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the page texture, the
 * pointer spring, and the frame loop; reads everything else from the
 * surface.
 */
function ParallaxInkLayer({
  shift,
  layers,
  shadow,
  background,
}: ParallaxInkLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);
  // 0 while the pointer is away — gates the parallax offset to nothing so
  // the page sits flat until the pointer actually arrives.
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
  const paramsRef = React.useRef({ shift, layers, shadow });
  React.useEffect(() => {
    paramsRef.current = { shift, layers, shadow };
  });

  // One frame: upload the texture if a new paint landed, then draw the
  // depth bands at wherever the pointer spring and reveal currently sit.
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
      u_shift: p.shift,
      u_layers: Math.round(p.layers),
      u_shadow: p.shadow,
      u_reveal: reveal.get(),
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, reveal]);

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

  // Every motion-value change and every completed paint asks for a frame —
  // the pointer spring and the reveal spring both settling is what stops
  // the loop; nothing here schedules a frame unasked.
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

  // Pointer on the host: the position springs on `glide`, jumping straight
  // to the pointer on entry so the layers never sweep in from a stale
  // spot. Reveal springs from 0 to 1 on entry and back to 0 on leave —
  // leaving x and y exactly where they last were, since it is reveal
  // alone that flattens the offset back to nothing as it settles.
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
      data-effect-canvas="parallax-ink"
      className="block h-full w-full"
    />
  );
}

/**
 * Splits the page's own ink into a few depth bands, read off how large
 * each mark blurs: a thin rule blurs down to nothing and stays put, a
 * solid heading or a filled seal holds together under the blur and reads
 * as near. The pointer springs a small offset that scales with each
 * band's depth, so the nearest ink drifts more than the farthest as the
 * cursor moves, and casts a soft shadow on whatever sits behind it. Every
 * band samples the same real texture at a shifted point — nothing is
 * duplicated or pre-cut — and a spring gated to the pointer's presence
 * flattens the whole page back to rest the moment it leaves.
 * Reduced motion: `SurfacePaint`'s replace-mode contract handles it — the
 * real DOM shows at full opacity and this layer renders nothing.
 */
export function ParallaxInk({
  shift = 10,
  layers = 3,
  shadow = 0.35,
  background,
  paint,
  className,
  children,
}: ParallaxInkProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <ParallaxInkLayer
          shift={shift}
          layers={layers}
          shadow={shadow}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
