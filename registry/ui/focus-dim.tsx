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

export type FocusDimProps = {
  /** CSS selector for elements the box can hold. @default "tr, button, [data-focus]" */
  selector?: string;
  /** Padding around the target's rect, in CSS pixels. @default 8 */
  padding?: number;
  /** How far the surroundings mix toward the background (0..1). @default 0.55 */
  dim?: number;
  /** Blur radius, in CSS pixels, for the 5-tap cross sampled outside the box. @default 3 */
  blur?: number;
  /** Scales the box spring's stiffness relative to `springs.snap` (1 = unscaled). @default 1 */
  spring?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec4 u_box;
uniform float u_dim;
uniform float u_blur;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const float RADIUS = 10.0;
const float FEATHER = 1.5;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  if (u_still > 0.5) {
    // Reduced motion: nothing steps back and nothing dims — the page shows
    // exactly as it is, unmoving.
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  vec2 boxHalf = max(u_box.zw, vec2(0.0)) * 0.5;
  vec2 boxCenter = u_box.xy + boxHalf;
  float radius = min(RADIUS, min(boxHalf.x, boxHalf.y));
  float sdf = sdRoundBox(px - boxCenter, boxHalf, radius);
  float outside = smoothstep(-FEATHER, FEATHER, sdf);
  if (outside <= 0.0) { o_color = vec4(0.0); return; }

  vec3 sum = sampleOver(px / u_res) * 0.2;
  sum += sampleOver((px + vec2(u_blur, 0.0)) / u_res) * 0.2;
  sum += sampleOver((px - vec2(u_blur, 0.0)) / u_res) * 0.2;
  sum += sampleOver((px + vec2(0.0, u_blur)) / u_res) * 0.2;
  sum += sampleOver((px - vec2(0.0, u_blur)) / u_res) * 0.2;

  vec3 dimmed = mix(sum, u_bg.rgb, u_dim);
  o_color = vec4(dimmed, outside);
}
`;

type FocusDimLayerProps = Required<
  Pick<FocusDimProps, "selector" | "padding" | "dim" | "blur" | "spring">
>;

/** Walks up from the host to the first opaque background colour, so a
 * transparent texel composites onto the page rather than onto black — the
 * same probe crystal-lens and edge-halo use for their own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture, and the
 * pointer-tracked box springs; reads everything else from the surface.
 */
function FocusDimLayer({
  selector,
  padding,
  dim,
  blur,
  spring,
}: FocusDimLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);
  const w = useMotionValue<number>(0);
  const h = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const hadTargetRef = React.useRef(false);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ selector, padding, dim, blur, spring });
  React.useEffect(() => {
    paramsRef.current = { selector, padding, dim, blur, spring };
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
      u_box: [x.get(), y.get(), w.get(), h.get()],
      u_dim: p.dim,
      u_blur: p.blur,
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, w, h]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // Keep the box covering the whole surface whenever nothing is held: the
  // motion values seed at (0,0,0,0) — the real size isn't known until the
  // first paint — and a resize must not leave a stale box pinned in the
  // corner while no target is under the pointer.
  React.useEffect(() => {
    if (hadTargetRef.current) return;
    x.jump(0);
    y.jump(0);
    w.jump(surface.width);
    h.jump(surface.height);
  }, [surface.width, surface.height, x, y, w, h]);

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
  // there is no idle loop, only the box moving asks for one.
  React.useEffect(() => {
    const unsubs = [x, y, w, h].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, w, h, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: find the element under the cursor, and spring the
  // box to its padded rect — or, with no target, out to the whole surface.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const fullBox = (): [number, number, number, number] => {
      const live = surfaceRef.current;
      return [0, 0, live.width, live.height];
    };

    const applyBox = (
      boxX: number,
      boxY: number,
      boxW: number,
      boxH: number,
      jump: boolean,
    ): void => {
      if (jump) {
        x.jump(boxX);
        y.jump(boxY);
        w.jump(boxW);
        h.jump(boxH);
        return;
      }
      const scale = paramsRef.current.spring;
      const transition = {
        ...springs.snap,
        stiffness: springs.snap.stiffness * scale,
      };
      animate(x, boxX, transition);
      animate(y, boxY, transition);
      animate(w, boxW, transition);
      animate(h, boxH, transition);
    };

    const move = (event: PointerEvent) => {
      const still = !surfaceRef.current.motionSafe;
      const found = document.elementFromPoint(event.clientX, event.clientY);
      const target = found?.closest(paramsRef.current.selector) ?? null;

      if (!target) {
        hadTargetRef.current = false;
        const [fx, fy, fw, fh] = fullBox();
        applyBox(fx, fy, fw, fh, still);
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const pad = paramsRef.current.padding;
      const boxX = rect.left - hostRect.left - pad;
      const boxY = rect.top - hostRect.top - pad;
      const boxW = rect.width + pad * 2;
      const boxH = rect.height + pad * 2;

      const jump = !hadTargetRef.current || still;
      hadTargetRef.current = true;
      applyBox(boxX, boxY, boxW, boxH, jump);
    };

    const leave = () => {
      hadTargetRef.current = false;
      const still = !surfaceRef.current.motionSafe;
      const [fx, fy, fw, fh] = fullBox();
      applyBox(fx, fy, fw, fh, still);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, x, y, w, h]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="focus-dim"
      className="block h-full w-full"
    />
  );
}

/**
 * Steps everything but the thing under the pointer back. `elementFromPoint`
 * plus `closest(selector)` finds the row, button, or `data-focus` element the
 * cursor sits over, and a padded, rounded box springs to its rect on
 * `springs.snap` — scaled by `spring` — jumping only the first time a target
 * is acquired, so it never drags in from a stale position. Outside that box
 * the painted texture is sampled through a 5-tap cross blur and mixed toward
 * the surface's own background by `dim`; inside it the shader draws nothing,
 * so the real DOM shows through sharp and every click still lands on it.
 * With no target — or the pointer off the surface — the box springs back out
 * to the whole surface, so nothing stays dimmed.
 * Reduced motion: the shader draws nothing and the box only jumps, never
 * springs — the page just holds still, undimmed.
 */
export function FocusDim({
  selector = "tr, button, [data-focus]",
  padding = 8,
  dim = 0.55,
  blur = 3,
  spring = 1,
  paint,
  className,
  children,
}: FocusDimProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <FocusDimLayer
          selector={selector}
          padding={padding}
          dim={dim}
          blur={blur}
          spring={spring}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
