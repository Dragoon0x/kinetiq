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

const TWO_PI = Math.PI * 2;

export type KaleidoLensProps = {
  /** Lens radius in CSS pixels. @default 190 */
  radius?: number;
  /** Feather width at the rim, as a fraction of the radius (0..1). @default 0.4 */
  softness?: number;
  /** Mirrored wedges the circle is folded into. @default 6 */
  wedges?: number;
  /** Rotation speed while the pointer sits inside, in revolutions per second. @default 0.35 */
  spin?: number;
  /** How far in from the rim the sample point is drawn before unfolding. @default 1.2 */
  zoom?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform int u_wedges;
uniform float u_spin;
uniform float u_zoom;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  // The feather always spans at least 1.5px so the two smoothstep edges
  // never collapse onto each other, even when softness is dialed to 0.
  float feather = max(clamp(u_softness, 0.0, 1.0) * R, 1.5);
  float edge = 1.0 - smoothstep(R - feather, R, r);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }
  float t = clamp(r / R, 0.0, 1.0);

  // Fold the angle about the lens centre into one of the wedges as a
  // mirrored slice: rotate by the accumulated spin, wrap into a full turn,
  // then find how far into its own wedge the angle sits. GLSL's mod()
  // already floors toward -infinity, so wrapped lands in [0, TWO_PI)
  // regardless of the sign atan2 handed back.
  float wedges = max(float(u_wedges), 1.0);
  float segment = 6.28318530718 / wedges;
  float angle = atan(d.y, d.x) + u_spin;
  float wrapped = mod(angle, 6.28318530718);
  float wedgeIndex = floor(wrapped / segment);
  float local = wrapped - wedgeIndex * segment;
  // Odd wedges read backward so the seam a wedge shares with its neighbour
  // lines up on both sides instead of jumping.
  bool oddWedge = mod(wedgeIndex, 2.0) >= 1.0;
  float sampleAngle = oddWedge ? (segment - local) : local;

  // Unfold: unlike a mirror, this is the same single wedge of the source
  // texture read again and again, so the whole lens is built from one
  // slice near the centre — pulled closer to the centre as zoom grows.
  float sampleRadius = r / max(u_zoom, 0.0001);
  vec2 srcPx = u_lens.xy + vec2(cos(sampleAngle), sin(sampleAngle)) * sampleRadius;
  vec3 color = sampleOver(srcPx / u_res);

  // A faint seam line at each wedge boundary, measured as an arc length so
  // its thickness reads the same near the centre and near the rim, and
  // rotates together with the pattern since it's measured in the same
  // spun angle space.
  float seamArc = min(local, segment - local) * r;
  float seamMask = 1.0 - smoothstep(0.0, 1.25, seamArc);
  color = mix(color, vec3(1.0), seamMask * 0.08);

  // Thin rim ring, brightened a touch under reduced motion so the frozen
  // lens still reads clearly as glass rather than a plain crop.
  float ring = smoothstep(0.9, 0.965, t) * (1.0 - smoothstep(0.965, 1.0, t));
  float ringBoost = u_still > 0.5 ? 1.4 : 1.0;
  color = mix(color, vec3(1.0), ring * 0.4 * ringBoost);

  o_color = vec4(color, u_opacity * edge);
}
`;

type LensLayerProps = Required<
  Pick<KaleidoLensProps, "radius" | "softness" | "wedges" | "spin" | "zoom">
>;

/** Walks up from the host to the first opaque background colour, so lens
 * samples over transparent texture regions composite onto the page rather
 * than onto black. Mirrors crystal-lens's effectiveBackground. */
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
 * spring, the spin accumulator, and the frame loop; reads everything else
 * from the surface.
 */
function LensLayer({ radius, softness, wedges, spin, zoom }: LensLayerProps) {
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
  const failedRef = React.useRef(false);

  // The spin angle accumulates only while the loop below is running, and
  // the loop only runs while the pointer is inside — so this value freezes
  // the instant the pointer leaves, rather than resetting.
  const spinAngleRef = React.useRef(0);
  const spinFrameRef = React.useRef<number | null>(null);
  const lastTickRef = React.useRef<number | null>(null);
  const insideRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, wedges, spin, zoom });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, wedges, spin, zoom };
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
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_wedges: Math.max(1, Math.round(p.wedges)),
      u_spin: spinAngleRef.current,
      u_zoom: Math.max(p.zoom, 0.0001),
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
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
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

  // Pointer on the host: spring the lens, fade in and out, and run the
  // spin loop only while the pointer is inside.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;

    // A plain local function, self-scheduling only while `insideRef` is
    // still true — the loop is the spin, and the spin only runs while the
    // pointer is inside the lens.
    const spinTick = (time: number) => {
      spinFrameRef.current = null;
      if (!insideRef.current) return;
      const last = lastTickRef.current;
      // Rebased on pause: the first tick after (re)starting contributes no
      // delta, so a gap while the pointer was outside never shows up as a
      // sudden jump in spin.
      const dt =
        last === null ? 0 : Math.min(Math.max(0, (time - last) / 1000), 0.1);
      lastTickRef.current = time;
      spinAngleRef.current += paramsRef.current.spin * TWO_PI * dt;
      requestFrame();
      spinFrameRef.current = requestAnimationFrame(spinTick);
    };

    const startSpin = (): void => {
      if (still || spinFrameRef.current !== null) return;
      lastTickRef.current = null;
      spinFrameRef.current = requestAnimationFrame(spinTick);
    };
    const stopSpin = (): void => {
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
      lastTickRef.current = null;
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
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      insideRef.current = true;
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
      startSpin();
    };
    const leave = () => {
      insideRef.current = false;
      stopSpin();
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
      stopSpin();
      insideRef.current = false;
    };
  }, [surface.host, x, y, opacity, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="kaleido-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A kaleidoscope riding the cursor. Inside the lens, the live interface is
 * read as polar coordinates around the pointer, folded into one of `wedges`
 * mirrored slices, spun forward while the pointer holds still over it, and
 * unfolded back out to a sample point near the centre — the same sliver of
 * page repeated and mirrored around the circle, so the seams always meet.
 * The DOM under the glass stays real: every click and focus lands on the
 * element it was aimed at, never on the canvas. The spin runs on its own
 * loop that starts on pointer-enter and stops dead on pointer-leave, so it
 * never ticks a frame when nobody's near it.
 * Reduced motion: a still kaleidoscope tracks the pointer position without
 * spinning or springing — the same fold, just frozen.
 */
export function KaleidoLens({
  radius = 190,
  softness = 0.4,
  wedges = 6,
  spin = 0.35,
  zoom = 1.2,
  paint,
  className,
  children,
}: KaleidoLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          wedges={wedges}
          spin={spin}
          zoom={zoom}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
