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

export type InkPullProps = {
  /** Reach of the pull in CSS pixels. @default 220 */
  radius?: number;
  /** Peak sample displacement in CSS pixels at full strength, dead centre. @default 28 */
  pull?: number;
  /** Stiffness multiplier shared by the pull's glide and the pointer's snap; 1 reproduces the house springs exactly, higher tightens, lower loosens. @default 1 */
  spring?: number;
  /** Highlight strength blending gathered ink toward `color` (0..1). @default 0.6 */
  gather?: number;
  /** Highlight colour, resolved against the host. @default "var(--primary)" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_pointer;
uniform float u_radius;
uniform float u_pull;
uniform float u_p;
uniform float u_gather;
uniform vec3 u_color;
uniform vec4 u_bg;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  // Reduced motion: the pull only reads as motion, so there is no honest
  // still frame for it — the overlay stays transparent and the real page
  // shows through untouched.
  if (u_still > 0.5) {
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  float R = max(u_radius, 1.0);
  float dist = length(px - u_pointer);
  // smoothstep needs e0 < e1, so the falling profile (1 at the pointer,
  // 0 at the rim) is the rising one flipped, not smoothstep(R, 0, dist).
  float profile = 1.0 - smoothstep(0.0, R, dist);
  if (profile <= 0.0) {
    o_color = vec4(0.0);
    return;
  }

  vec2 toward = u_pointer - px;
  float towardLen = length(toward);
  vec2 dir = towardLen > 0.0001 ? toward / towardLen : vec2(0.0);

  // Read the ink from a point already leaning toward the pointer, so what
  // lands on this pixel is what the pull dragged in from further out.
  vec2 samplePx = px + dir * u_pull * u_p * profile;
  vec3 sampled = sampleOver(samplePx / u_res);

  // Only actual ink gets drawn — a sample that lands back on bare page
  // stays bare page, so the overlay never paints a false patch of colour.
  float isInk = smoothstep(0.02, 0.06, length(sampled - u_bg.rgb));

  float gatherR = R * 0.25;
  float gatherAmt = (1.0 - smoothstep(0.0, gatherR, dist)) * u_gather;
  vec3 gathered = mix(sampled, u_color, gatherAmt);

  vec3 rgb = mix(u_bg.rgb, gathered, isInk);
  float alpha = profile * u_p;
  o_color = vec4(rgb, alpha);
}
`;

type InkPullLayerProps = Required<
  Pick<InkPullProps, "radius" | "pull" | "spring" | "gather" | "color">
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
 * The GL layer. Owns the context, the program, the texture, the pointer and
 * pull springs, and the frame loop; reads everything else from the surface.
 */
function InkPullLayer({
  radius,
  pull,
  spring,
  gather,
  color,
}: InkPullLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const p = useMotionValue<number>(0);

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
  const paramsRef = React.useRef({ radius, pull, gather });
  React.useEffect(() => {
    paramsRef.current = { radius, pull, gather };
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
    const params = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_pointer: [x.get(), y.get()],
      u_radius: params.radius,
      u_pull: params.pull,
      u_p: p.get(),
      u_gather: params.gather,
      u_color: [colorRef.current[0], colorRef.current[1], colorRef.current[2]],
      u_bg: bgRef.current,
      u_still: live.motionSafe ? 0 : 1,
    });
    tri.draw();
  }, [x, y, p]);

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
  // Once the pointer leaves and both springs settle, "change" stops firing
  // and this loop stops on its own — nothing here re-schedules itself.
  React.useEffect(() => {
    const unsubs = [x, y, p].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, p, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colour resolves against the host so a `var(--token)` picks up the
  // theme in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: spring the pointer toward the cursor and spring
  // the pull amount up while it is inside, back down once it leaves.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;
    const glideTransition = scaleSpring(springs.glide, spring);
    const snapTransition = scaleSpring(springs.snap, spring);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, snapTransition);
        animate(y, py, snapTransition);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      if (still) p.set(1);
      else animate(p, 1, glideTransition);
    };
    const leave = () => {
      if (still) p.set(0);
      else animate(p, 0, glideTransition);
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
  }, [surface.host, spring, x, y, p]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="ink-pull"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface's own ink, pulled toward the pointer like filings toward a
 * magnet. Nothing on the page actually moves: every frame reads the painted
 * texture at a point already leaning toward the pointer and draws that
 * sample back where it found it, so ink within `radius` looks tugged in
 * while the real DOM underneath stays exactly where it was. The pull is a
 * spring — it eases in while the pointer sits inside the radius and eases
 * back out once it leaves, never snapping — and ink caught near the
 * pointer brightens toward `color`, like it is gathering at the source.
 * Reduced motion: the overlay draws nothing and the page shows through
 * untouched.
 */
export function InkPull({
  radius = 220,
  pull = 28,
  spring = 1,
  gather = 0.6,
  color = "var(--primary)",
  paint,
  className,
  children,
}: InkPullProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <InkPullLayer
          radius={radius}
          pull={pull}
          spring={spring}
          gather={gather}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
