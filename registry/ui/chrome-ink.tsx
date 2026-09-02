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

export type ChromeInkProps = {
  /** Luma threshold below which a pixel reads as page ink rather than open ground (0..1). @default 0.35 */
  threshold?: number;
  /** Strength of the bevel carved from the ink mask's blurred gradient. @default 1.4 */
  bevel?: number;
  /** Reflected sky colour, any CSS colour (tokens included). @default "#cfe4ff" */
  sky?: string;
  /** Reflected ground colour, any CSS colour (tokens included). @default "#3b3f46" */
  ground?: string;
  /** Fill for regions where the painted texture is transparent. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_LUMA +
  /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_threshold;
uniform float u_bevel;
uniform vec3 u_sky;
uniform vec3 u_ground;
uniform vec2 u_pointer;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// How much of this pixel is page ink rather than open ground: zero where
// the painted texture is transparent, zero where the composited colour
// reads within 0.04 of the fill colour, otherwise a smoothstep on inverse
// luma so only the darker glyphs and rules turn to chrome.
float sampleMask(vec2 uv) {
  vec4 raw = texture(u_tex, clamp(uv, 0.0, 1.0));
  if (raw.a < 0.01) return 0.0;
  vec3 rgb = mix(u_bg.rgb, raw.rgb, raw.a);
  if (length(rgb - u_bg.rgb) < 0.04) return 0.0;
  float luma = kx_luma(rgb);
  return smoothstep(u_threshold, 1.0, 1.0 - luma);
}

// A 5-tap cross blur of the mask, so the gradient taken from it reads a
// rounded shoulder instead of a text glyph's stair-step edge.
float blurredMask(vec2 uv, vec2 texel) {
  float c = sampleMask(uv);
  float u = sampleMask(uv - vec2(0.0, texel.y));
  float d = sampleMask(uv + vec2(0.0, texel.y));
  float l = sampleMask(uv - vec2(texel.x, 0.0));
  float r = sampleMask(uv + vec2(texel.x, 0.0));
  return (c + u + d + l + r) / 5.0;
}

void main() {
  vec3 page = sampleOver(v_uv);
  vec2 texel = 1.5 / u_res;
  float m = blurredMask(v_uv, texel);
  if (m <= 0.001) {
    o_color = vec4(page, 1.0);
    return;
  }

  float gx = (blurredMask(v_uv + vec2(texel.x, 0.0), texel) -
              blurredMask(v_uv - vec2(texel.x, 0.0), texel)) * u_bevel;
  float gy = (blurredMask(v_uv + vec2(0.0, texel.y), texel) -
              blurredMask(v_uv - vec2(0.0, texel.y), texel)) * u_bevel;
  vec3 n = normalize(vec3(-gx, -gy, 1.0));

  vec2 px = v_uv * u_res;
  float v = n.y * 0.5 + 0.5 + (u_pointer.y - px.y) / u_res.y * 0.2;

  // A sharp horizon at v = 0.5: ground below, sky above, with a thin bright
  // seam where the two meet.
  vec3 reflection;
  if (v < 0.5) {
    reflection = mix(u_ground, u_ground * 1.6, v * 2.0);
  } else {
    reflection = mix(u_sky * 0.7, u_sky, (v - 0.5) * 2.0);
  }
  reflection += vec3(1.0) * 0.6 * exp(-abs(v - 0.5) * 40.0);

  vec3 L = normalize(vec3(u_pointer - px, 300.0));
  float spec = pow(max(dot(n, L), 0.0), 24.0);
  vec3 specular = vec3(1.0) * 0.6 * spec;

  vec3 color = mix(page, reflection + specular, m);
  o_color = vec4(color, 1.0);
}
`;

type InkLayerProps = Required<
  Pick<ChromeInkProps, "threshold" | "bevel" | "sky" | "ground">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * transparent region of the painted texture composites onto the page rather
 * than onto black — the same probe crystal-lens and mercury-pool use. */
function effectiveBackground(
  el: HTMLElement | null,
): [number, number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg, node);
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
 * The GL layer. Owns the context, the program, the texture, the sprung
 * pointer, and the frame loop; reads everything else from the surface.
 */
function InkLayer({
  threshold,
  bevel,
  sky,
  ground,
  background,
}: InkLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const skyRef = React.useRef<[number, number, number]>([0.81, 0.89, 1]);
  const groundRef = React.useRef<[number, number, number]>([0.23, 0.25, 0.27]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ threshold, bevel });
  React.useEffect(() => {
    paramsRef.current = { threshold, bevel };
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
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_threshold: p.threshold,
      u_bevel: p.bevel,
      u_sky: skyRef.current,
      u_ground: groundRef.current,
      u_pointer: [x.get(), y.get()],
      u_bg: bg,
    });
    tri.draw();
  }, [x, y]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect never sees the canvas.
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

  // Every pointer-spring tick asks for a frame; the springs stop firing
  // "change" once they settle, so the loop stops itself with them.
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
  // caller changes them — `var(--token)` needs the host's computed style.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    const skyRgba = resolveColor(sky, host);
    skyRef.current = [skyRgba[0], skyRgba[1], skyRgba[2]];
    const groundRgba = resolveColor(ground, host);
    groundRef.current = [groundRgba[0], groundRgba[1], groundRgba[2]];
    requestFrame();
  }, [surface.host, background, sky, ground, requestFrame]);

  // Pointer on the host: spring toward it on `glide`. A fresh host starts
  // the light centred so the resting chrome already reads as lit before
  // any hover; every move (and re-entry) springs the light after it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      x.jump(rect.width / 2);
      y.jump(rect.height / 2);
    }

    const move = (event: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const px = event.clientX - r.left;
      const py = event.clientY - r.top;
      animate(x, px, springs.glide);
      animate(y, py, springs.glide);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", move);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", move);
    };
  }, [surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="chrome-ink"
      className="block h-full w-full"
    />
  );
}

/**
 * The page's own ink read as polished chrome. Text and rules are found by
 * an inverse-luma mask, blurred five taps across so the gradient taken from
 * it carves a rounded bevel rather than a stair-step, and that bevel's
 * normal reflects a two-tone sky-and-ground environment behind a sharp
 * horizon seam. The pointer is a light overhead, sprung on `glide`: sweep
 * it across the panel and the horizon tilts and the specular glint slides
 * with it, both settling back to rest the moment the spring does — nothing
 * animates on its own. Everything outside the ink stays the plain painted
 * page. Reduced motion: this layer renders nothing and the real DOM shows
 * at full opacity.
 */
export function ChromeInk({
  threshold = 0.35,
  bevel = 1.4,
  sky = "#cfe4ff",
  ground = "#3b3f46",
  background,
  paint,
  className,
  children,
}: ChromeInkProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <InkLayer
          threshold={threshold}
          bevel={bevel}
          sky={sky}
          ground={ground}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
