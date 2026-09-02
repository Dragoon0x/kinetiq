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

export type CarbonGhostProps = {
  /** Tint of the carbon impression showing through wherever the real ink does not cover it. @default "#3b4a8a" */
  color?: string;
  /** Resting offset of the copy from the original, in CSS px, both axes. @default 6 */
  offset?: number;
  /** How strongly the ghost and its smudge composite into the background (0..1). @default 0.45 */
  strength?: number;
  /** Multiplier on how far the pointer's distance from centre drags the copy further out. @default 1 */
  drift?: number;
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
uniform vec2 u_offset;
uniform float u_strength;
uniform vec4 u_color;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

// Finds "ink": darker pixels count toward the mask; anything close to
// transparent or close to the page's own background is gated to zero, so
// paper never reads back as a stroke.
float kx_inkMask(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  float luma = kx_luma(t.rgb);
  float mask = smoothstep(0.3, 0.85, 1.0 - luma);
  float alphaGate = smoothstep(0.0, 0.04, t.a);
  float bgGate = smoothstep(0.0, 0.04, length(t.rgb - u_bg.rgb));
  return mask * alphaGate * bgGate;
}

// The ghost: the mask sampled at the full offset, softened with a cheap
// 3-tap blur so the copy reads as pressed rather than pasted.
float kx_ghost(vec2 px) {
  vec2 uv = px / u_res;
  vec2 d = vec2(1.5) / u_res;
  float centre = kx_inkMask(uv);
  float a = kx_inkMask(uv + d);
  float b = kx_inkMask(uv - d);
  return centre * 0.5 + a * 0.25 + b * 0.25;
}

// The smudge: the mask sampled at half the offset, spread wide with a
// 5-tap cross blur — the sheet dragging looser just beneath the top one.
float kx_smudge(vec2 px) {
  vec2 uv = px / u_res;
  vec2 dx = vec2(6.0, 0.0) / u_res;
  vec2 dy = vec2(0.0, 6.0) / u_res;
  float centre = kx_inkMask(uv);
  float left = kx_inkMask(uv - dx);
  float right = kx_inkMask(uv + dx);
  float up = kx_inkMask(uv - dy);
  float down = kx_inkMask(uv + dy);
  return (centre + left + right + up + down) * 0.2;
}

void main() {
  vec2 px = v_uv * u_res;

  float ghost = kx_ghost(px - u_offset);
  float smudge = kx_smudge(px - u_offset * 0.5);
  float ghostAlpha = clamp(
    ghost * u_strength * 0.5 + smudge * 0.3 * u_strength,
    0.0,
    1.0
  );
  vec3 under = mix(u_bg.rgb, u_color.rgb, ghostAlpha);

  vec4 pageTex = texture(u_tex, v_uv);
  vec3 page = mix(u_bg.rgb, pageTex.rgb, pageTex.a);
  float here = kx_inkMask(v_uv);

  o_color = vec4(mix(under, page, here), 1.0);
}
`;

/** Walks up from the host to the first opaque background colour, the same
 * fallback crystal-lens and warp-grid use, so a fully transparent painted
 * texture composites onto the page rather than onto black. */
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

type GhostLayerProps = Required<
  Pick<CarbonGhostProps, "color" | "offset" | "strength" | "drift">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function GhostLayer({
  color,
  offset,
  strength,
  drift,
  background,
}: GhostLayerProps) {
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
  const colorRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ offset, strength, drift });
  React.useEffect(() => {
    paramsRef.current = { offset, strength, drift };
  });

  // One frame: upload the texture if a new paint landed, resolve the
  // pointer spring into a px offset, then draw.
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
    const offsetX = p.offset + (x.get() - cssW / 2) * p.drift * 0.05;
    const offsetY = p.offset + (y.get() - cssH / 2) * p.drift * 0.05;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_offset: [offsetX, offsetY],
      u_strength: p.strength,
      u_color: colorRef.current,
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

  // The pointer spring only asks for a frame while it is still moving —
  // motion's spring stops emitting "change" once it settles, so the loop
  // is self-stopping without any extra bookkeeping.
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
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, color, background, requestFrame]);

  // Pointer on the host: the copy sheet springs toward it on `glide`, and
  // eases back to centre — the resting offset — once the pointer leaves.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    x.jump(rect.width / 2);
    y.jump(rect.height / 2);

    const move = (event: PointerEvent) => {
      const r = host.getBoundingClientRect();
      animate(x, event.clientX - r.left, springs.glide);
      animate(y, event.clientY - r.top, springs.glide);
    };
    const leave = () => {
      const r = host.getBoundingClientRect();
      animate(x, r.width / 2, springs.glide);
      animate(y, r.height / 2, springs.glide);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="carbon-ghost"
      className="block h-full w-full"
    />
  );
}

/**
 * A carbon copy pressed into the page from underneath: every glyph the
 * painter renders casts a second, duller impression at a fixed offset,
 * tinted with `color` and showing through the background wherever the real
 * ink does not already cover it. The mask that finds "ink" is nothing more
 * than luminance — dark pixels count, anything near-transparent or near the
 * page's own background does not — so the copy tracks whatever the surface
 * paints without a separate pass. Move the pointer and the copy drags a
 * little further out from centre, sprung on `glide` so it settles rather
 * than snaps; the loop only runs while that spring is still moving.
 * Reduced motion: SurfacePaint renders in replace mode, so the layer
 * returns null and the real DOM shows in its place.
 */
export function CarbonGhost({
  color = "#3b4a8a",
  offset = 6,
  strength = 0.45,
  drift = 1,
  background,
  paint,
  className,
  children,
}: CarbonGhostProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <GhostLayer
          color={color}
          offset={offset}
          strength={strength}
          drift={drift}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
