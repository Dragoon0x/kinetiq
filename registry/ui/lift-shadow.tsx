"use client";

import * as React from "react";

import { animate, useMotionValue, type Transition } from "motion/react";

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

export type LiftShadowProps = {
  /** CSS selector for elements that can rise off the page. @default "tr, button, [data-lift]" */
  selector?: string;
  /** How far the target rises at full lift, in CSS pixels. @default 8 */
  lift?: number;
  /** Extra scale at full lift, applied about the target's own centre (0.03 = 3% larger). @default 0.03 */
  scale?: number;
  /** Shadow alpha at full lift (0..1). @default 0.22 */
  shadow?: number;
  /** Stiffness multiplier shared by the rect's snap and the lift's glide; 1 reproduces the house springs exactly. @default 1 */
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
uniform float u_lift;
uniform float u_liftPx;
uniform float u_scaleAmt;
uniform float u_shadow;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const float SHADOW_RADIUS = 10.0;
const float SHADOW_BLUR = 24.0;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float sdRoundBox(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  // Reduced motion, or nothing lifted: draw nothing.
  if (u_still > 0.5 || u_lift <= 0.001) { o_color = vec4(0.0); return; }

  vec2 px = v_uv * u_res;
  vec2 halfSize = max(u_box.zw, vec2(0.0)) * 0.5;
  vec2 center = u_box.xy + halfSize;
  float liftOffset = u_lift * u_liftPx;

  // The raised copy: the tracked rect, offset up, then scaled about its
  // own (already-offset) centre.
  vec2 liftedCenter = vec2(center.x, center.y - liftOffset);
  vec2 liftedHalf = halfSize * (1.0 + u_scaleAmt * u_lift);
  vec2 pLifted = px - liftedCenter;
  float sdLifted = sdRoundBox(pLifted, liftedHalf, 0.0);
  float aTop = 1.0 - smoothstep(-1.0, 1.0, sdLifted);

  vec3 topColor = vec3(0.0);
  if (aTop > 0.0) {
    // Inverse transform: this pixel's normalised position inside the raised
    // box maps back onto the original rect, so the copy shows the same
    // content the DOM paints underneath, only lifted — never a second,
    // unrelated sample.
    vec2 uLifted = (pLifted + liftedHalf) / max(liftedHalf * 2.0, vec2(0.0001));
    vec2 srcPx = u_box.xy + uLifted * u_box.zw;
    topColor = sampleOver(srcPx / u_res);
  }

  // The shadow: the rect at its original size, offset down further than the
  // lift, rounded and blurred outward from its edge.
  vec2 shadowCenter = vec2(center.x, center.y + liftOffset * 1.5);
  float shadowRadius = min(SHADOW_RADIUS, min(halfSize.x, halfSize.y));
  float sdShadow = sdRoundBox(px - shadowCenter, halfSize, shadowRadius);
  float fade = 1.0 - smoothstep(0.0, SHADOW_BLUR, sdShadow);
  float aBottom = u_shadow * u_lift * fade;

  // Standard "raised copy over shadow" compositing — this is what keeps the
  // shadow from ever showing inside the raised box without a separate mask.
  float aOut = aTop + aBottom * (1.0 - aTop);
  vec3 colorOut = aOut > 0.0001 ? (topColor * aTop) / aOut : vec3(0.0);
  o_color = vec4(colorOut, aOut);
}
`;

type LiftLayerProps = Required<
  Pick<LiftShadowProps, "selector" | "lift" | "scale" | "shadow" | "spring">
>;

/** Walks up from the host to the first opaque background colour, so a
 * sample that lands on a transparent texture region composites onto the
 * page rather than onto black — the same probe crystal-lens uses. */
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
 * Scales a house spring by `factor`: stiffness moves with the square of it
 * and damping with the factor itself, so the damping ratio — the settle's
 * character — never shifts, only its speed. `factor` 1 reproduces `base`
 * exactly.
 */
function scaleSpring(
  base: { stiffness: number; damping: number; mass: number },
  factor: number,
): Transition {
  const k = Math.max(factor, 0.02);
  return {
    type: "spring",
    stiffness: base.stiffness * k * k,
    damping: base.damping * k,
    mass: base.mass,
  };
}

/**
 * The GL layer. Owns the context, the program, the texture, the tracked
 * rect and lift springs, and the frame loop; reads everything else from the
 * surface.
 */
function LiftLayer({ selector, lift, scale, shadow, spring }: LiftLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);
  const w = useMotionValue<number>(0);
  const h = useMotionValue<number>(0);
  const L = useMotionValue<number>(0);

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
  const paramsRef = React.useRef({ selector, lift, scale, shadow });
  React.useEffect(() => {
    paramsRef.current = { selector, lift, scale, shadow };
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
      u_lift: L.get(),
      u_liftPx: p.lift,
      u_scaleAmt: p.scale,
      u_shadow: p.shadow,
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, w, h, L]);

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

  // Every motion-value change and every completed paint asks for a frame.
  // Once the pointer leaves and the rect and lift springs settle, "change"
  // stops firing and this loop stops on its own — nothing here re-schedules
  // itself, so the effect never runs while the target sits still.
  React.useEffect(() => {
    const unsubs = [x, y, w, h, L].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, w, h, L, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: find the element under the cursor, spring the
  // tracked rect to it, and spring the lift up while it is held, back down
  // once it is lost or the pointer leaves.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const snapTransition = scaleSpring(springs.snap, spring);
    const glideTransition = scaleSpring(springs.glide, spring);

    const move = (event: PointerEvent) => {
      const still = !surfaceRef.current.motionSafe;
      const found = document.elementFromPoint(event.clientX, event.clientY);
      const target = found?.closest(paramsRef.current.selector) ?? null;

      if (!target) {
        hadTargetRef.current = false;
        if (still) L.set(0);
        else if (L.get() > 0.001) animate(L, 0, glideTransition);
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const boxX = rect.left - hostRect.left;
      const boxY = rect.top - hostRect.top;
      const boxW = rect.width;
      const boxH = rect.height;

      if (!hadTargetRef.current || still) {
        x.jump(boxX);
        y.jump(boxY);
        w.jump(boxW);
        h.jump(boxH);
      } else {
        animate(x, boxX, snapTransition);
        animate(y, boxY, snapTransition);
        animate(w, boxW, snapTransition);
        animate(h, boxH, snapTransition);
      }
      hadTargetRef.current = true;

      if (still) L.set(1);
      else if (L.get() < 0.999) animate(L, 1, glideTransition);
    };

    const leave = () => {
      hadTargetRef.current = false;
      if (!surfaceRef.current.motionSafe) L.set(0);
      else animate(L, 0, glideTransition);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, spring, x, y, w, h, L]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="lift-shadow"
      className="block h-full w-full"
    />
  );
}

/**
 * Whatever sits under the pointer rises off the page. `elementFromPoint`
 * plus `closest(selector)` finds the target, and its rect springs into a box
 * the fragment shader reads back every frame: a raised copy, offset up and
 * scaled about its own centre, sampled from the painted texture at the
 * inverse of that same transform — so the DOM's own copy underneath reads as
 * covered, never doubled — sits over a blurred, rounded-rect shadow cast by
 * the rect at its original size and position. Everything runs off five
 * springing motion values and the loop stops the moment they settle.
 * Reduced motion: the canvas draws nothing and the page stays flat.
 */
export function LiftShadow({
  selector = "tr, button, [data-lift]",
  lift = 8,
  scale = 0.03,
  shadow = 0.22,
  spring = 1,
  paint,
  className,
  children,
}: LiftShadowProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <LiftLayer
          selector={selector}
          lift={lift}
          scale={scale}
          shadow={shadow}
          spring={spring}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
