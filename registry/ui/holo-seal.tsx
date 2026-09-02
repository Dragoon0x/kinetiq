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

export type HoloSealProps = {
  /** CSS selector for the elements that carry the seal. @default "[data-holo]" */
  selector?: string;
  /** Engraved-line pitch, in CSS pixels. @default 6 */
  lines?: number;
  /** Blend strength of the rainbow over the page, inside a sealed rect (0..1). @default 0.85 */
  strength?: number;
  /** How much the hue turns per radian of pointer angle. @default 0.5 */
  speed?: number;
  /** Fill for regions where the painted texture is transparent. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// uniform vec4 u_rects[MAX_RECTS] — keep in lockstep with the shader's array
// size below. 4 floats per rect (x, y, w, h), flattened.
const MAX_RECTS = 16;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec4 u_rects[${MAX_RECTS}];
uniform highp int u_count;
uniform float u_angle;
uniform float u_speed;
uniform float u_lines;
uniform float u_strength;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

const float TAU = 6.28318530718;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 page = sampleOver(v_uv);

  // Which sealed rect (if any) this pixel falls inside. The uniform array
  // is only ever walked by the loop counter, and the loop bails the moment
  // it passes the live count.
  bool inside = false;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= u_count) break;
    vec4 r = u_rects[i];
    if (px.x >= r.x && px.x <= r.x + r.z && px.y >= r.y && px.y <= r.y + r.w) {
      inside = true;
      break;
    }
  }

  if (!inside) {
    o_color = vec4(page, 1.0);
    return;
  }

  // Hue turns with the pointer's angle about the host centre, plus a fixed
  // per-pixel ramp so the rainbow reads as a foil pattern rather than one
  // flat wash across every seal at once.
  float hue = fract(dot(px, vec2(cos(0.6), sin(0.6))) * 0.01 + u_angle * u_speed);
  vec3 rainbow = 0.5 + 0.5 * cos(TAU * (hue + vec3(0.0, 0.33, 0.67)));

  // A fine engraved hatch, like foil pressed with parallel grooves.
  float lines = 1.0 - 0.25 * (0.5 + 0.5 * sin(px.y * TAU / max(u_lines, 1.0)));

  // Dark ink (text on the badge) pushes the seal back so the label stays
  // readable through the foil instead of drowning under it.
  float luma = kx_luma(page);
  float inkMask = smoothstep(0.3, 0.85, 1.0 - luma);

  vec3 sealed = mix(page, rainbow * lines, u_strength * (1.0 - inkMask * 0.6));
  o_color = vec4(sealed, 1.0);
}
`;

/** Walks up from the host to the first opaque background colour, so a
 * transparent texel composites onto the page rather than onto black — the
 * same probe crystal-lens uses for its own backdrop. */
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

/** Reads up to MAX_RECTS host-relative rects for `selector` into `target`
 * (reused across calls, zero-padded past the live count) and returns the
 * count. A module-level helper, not a direct mutation of a ref alias inside
 * the effect that calls it — the same shape as glyph-sweep's retainCopy. */
function collectRects(
  host: HTMLElement,
  selector: string,
  target: Float32Array,
): number {
  const hostRect = host.getBoundingClientRect();
  const found = host.querySelectorAll(selector);
  const count = Math.min(found.length, MAX_RECTS);
  for (let i = 0; i < MAX_RECTS; i += 1) {
    const el = i < count ? (found[i] ?? null) : null;
    const base = i * 4;
    if (el) {
      const r = el.getBoundingClientRect();
      target[base] = r.left - hostRect.left;
      target[base + 1] = r.top - hostRect.top;
      target[base + 2] = r.width;
      target[base + 3] = r.height;
    } else {
      target[base] = 0;
      target[base + 1] = 0;
      target[base + 2] = 0;
      target[base + 3] = 0;
    }
  }
  return count;
}

type SealLayerProps = Required<
  Pick<HoloSealProps, "selector" | "lines" | "strength" | "speed">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the texture, the rect list,
 * the pointer-angle spring, and the frame loop; reads everything else from
 * the surface.
 */
function SealLayer({
  selector,
  lines,
  strength,
  speed,
  background,
}: SealLayerProps) {
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
  const rectsRef = React.useRef<Float32Array>(new Float32Array(MAX_RECTS * 4));
  const countRef = React.useRef(0);
  const centerRef = React.useRef<{ cx: number; cy: number }>({
    cx: 0,
    cy: 0,
  });
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ lines, strength, speed });
  React.useEffect(() => {
    paramsRef.current = { lines, strength, speed };
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
    const centre = centerRef.current;
    const angle = Math.atan2(y.get() - centre.cy, x.get() - centre.cx);
    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_rects: rectsRef.current,
      u_count: countRef.current,
      u_angle: angle,
      u_speed: p.speed,
      u_lines: p.lines,
      u_strength: p.strength,
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

  // Every motion-value change asks for a frame — this is the whole loop:
  // `animate(..., springs.glide)` keeps firing "change" while the angle is
  // still settling and stops on its own the moment it's at rest, so nothing
  // here ever schedules a frame the spring itself didn't ask for.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Rects are re-read on mount and every time a new paint lands — layout
  // may have shifted the badges even when the pointer hasn't moved.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    countRef.current = collectRects(host, selector, rectsRef.current);
    requestFrame();
  }, [surface.host, surface.version, selector, requestFrame]);

  // Colours are resolved against the host once it exists, and again if the
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Pointer on the host: spring toward it on `springs.glide` so the angle
  // eases into place rather than snapping frame to frame.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    centerRef.current = { cx: rect.width / 2, cy: rect.height / 2 };
    x.jump(rect.width / 2);
    y.jump(rect.height / 2);

    const move = (event: PointerEvent) => {
      const hostRect = host.getBoundingClientRect();
      centerRef.current = {
        cx: hostRect.width / 2,
        cy: hostRect.height / 2,
      };
      animate(x, event.clientX - hostRect.left, springs.glide);
      animate(y, event.clientY - hostRect.top, springs.glide);
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
      data-effect-canvas="holo-seal"
      className="block h-full w-full"
    />
  );
}

/**
 * A holographic foil seal stamped onto whichever elements match `selector`.
 * The rest of the page is the real, painted texture, untouched; only the
 * matched rects — collected fresh on mount and after every repaint, up to
 * 16 of them — get the treatment: a rainbow whose hue turns with the angle
 * from the host's centre to the pointer, crossed with a fine engraved
 * hatch, and pulled back over dark ink so a badge's label stays legible.
 * The angle is a spring (`springs.glide`), so the colour eases toward the
 * pointer rather than tracking it instantly, and the redraw loop lives
 * entirely on that spring's own "change" events — it runs while the angle
 * is still settling and goes quiet the instant it's at rest.
 * Reduced motion: `SurfacePaint`'s replace-mode contract handles it — the
 * layer renders nothing and the real, unsealed DOM shows in its place.
 */
export function HoloSeal({
  selector = "[data-holo]",
  lines = 6,
  strength = 0.85,
  speed = 0.5,
  background,
  paint,
  className,
  children,
}: HoloSealProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SealLayer
          selector={selector}
          lines={lines}
          strength={strength}
          speed={speed}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
