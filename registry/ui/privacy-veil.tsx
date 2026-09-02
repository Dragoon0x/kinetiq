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

export type PrivacyVeilProps = {
  /** Radius of the clear circle in CSS pixels, at full reveal. @default 150 */
  radius?: number;
  /** Width in CSS pixels the circle's edge feathers over. @default 40 */
  softness?: number;
  /** Blur radius in CSS pixels for the frosted veil, sampled with a 13-tap Poisson disc. @default 6 */
  blur?: number;
  /** How far the veil is mixed toward white (0..1). @default 0.5 */
  frost?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_circle;
uniform float u_softness;
uniform float u_blur;
uniform float u_frost;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A 13-point Vogel spiral in the unit disc — an even blur spread with no
// repeating ring the way a fixed-angle fan of taps would show. Mirrors
// bloom-halo's kx_poisson13.
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
  if (u_still > 0.5) {
    // Reduced motion: nothing springs the circle open, so the veil draws
    // nothing at all rather than freezing shut over the whole page.
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  float r = distance(px, u_circle.xy);
  float radius = max(u_circle.z, 0.0);
  float half_ = max(u_softness, 0.001) * 0.5;
  float alpha = smoothstep(radius - half_, radius + half_, r);
  if (alpha <= 0.0) { o_color = vec4(0.0); return; }

  vec3 blurred = vec3(0.0);
  for (int i = 0; i < 13; i++) {
    vec2 offset = kx_poisson13[i] * max(u_blur, 0.0);
    blurred += sampleOver((px + offset) / u_res);
  }
  blurred /= 13.0;

  vec3 frosted = mix(blurred, vec3(1.0), clamp(u_frost, 0.0, 1.0));
  o_color = vec4(frosted, alpha);
}
`;

type VeilLayerProps = Required<
  Pick<PrivacyVeilProps, "radius" | "softness" | "blur" | "frost">
>;

/** Walks up from the host to the first opaque background colour, so a
 * blurred sample over a transparent texture region composites onto the
 * page rather than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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
 * springs, and the frame loop; reads everything else from the surface.
 */
function VeilLayer({ radius, softness, blur, frost }: VeilLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
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
  const paramsRef = React.useRef({ radius, softness, blur, frost });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, blur, frost };
  });

  // One frame: upload the texture if a new paint landed, then draw the
  // veil at wherever the pointer springs currently sit.
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
      u_circle: [x.get(), y.get(), p.radius * reveal.get()],
      u_softness: p.softness,
      u_blur: p.blur,
      u_frost: p.frost,
      u_still: live.motionSafe ? 0 : 1,
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
  // the pointer springs and the reveal spring settling is what stops firing
  // "change", which is what stops the loop; nothing here schedules a frame
  // unasked.
  React.useEffect(() => {
    const unsubs = [x, y, reveal].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, reveal, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The backdrop fill is resolved against the host once it exists, so a
  // fully transparent region of the painted texture composites onto the
  // page's own background rather than onto black.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    requestFrame();
  }, [surface.host, requestFrame]);

  // Pointer on the host: the circle's centre jumps straight to the cursor
  // on entry (never sweeps in from off-screen), then springs to follow on
  // `snap`; `reveal` springs from 0 to 1 while the pointer is present and
  // back to 0 on leave, which is what closes the circle and re-veils
  // everything under it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const still = !surfaceRef.current.motionSafe;
    const openReveal = () => {
      if (Math.abs(reveal.get() - 1) < 0.001) return;
      if (still) reveal.set(1);
      else animate(reveal, 1, springs.snap);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      openReveal();
    };
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
      openReveal();
    };
    const leave = () => {
      if (still) reveal.set(0);
      else animate(reveal, 0, springs.snap);
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
  }, [surface.host, x, y, reveal]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="privacy-veil"
      className="block h-full w-full"
    />
  );
}

/**
 * A frosted veil over the whole interface, with one clear circle where the
 * cursor rests. Outside the circle the painted texture is blurred with a
 * 13-tap Poisson disc and mixed toward white by `frost`; inside it the veil
 * is fully transparent, the boundary feathered over `softness` CSS pixels
 * so the opening reads as glass fogging back rather than a hard cutout. The
 * circle's centre jumps to the pointer on entry and springs to follow it;
 * a separate `reveal` value springs the radius open while the pointer is
 * present and shut on leave, so lifting the cursor re-covers everything —
 * nothing under the veil is simulated, it is the same live DOM the veil
 * itself is drawn over.
 * Reduced motion: the shader draws nothing and the real interface stands
 * fully uncovered, because a veil that cannot be opened by a spring should
 * not stay shut.
 */
export function PrivacyVeil({
  radius = 150,
  softness = 40,
  blur = 6,
  frost = 0.5,
  paint,
  className,
  children,
}: PrivacyVeilProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <VeilLayer
          radius={radius}
          softness={softness}
          blur={blur}
          frost={frost}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
