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

export type CylinderRollMode = "scroll" | "manual";

export type CylinderRollProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "manual" takes `progress` directly. @default "scroll" */
  mode?: CylinderRollMode;
  /** The roll position for `mode="manual"`, 0 (page start, at the drum's seam) to 1 (a full turn on). Ignored otherwise. */
  progress?: number;
  /** Drum radius, as a fraction of the surface's own height. Smaller curls the page tighter and letterboxes top and bottom; larger flattens toward a plain scroll. @default 0.6 */
  radius?: number;
  /** How many drum heights the page travels per unit of scroll progress. @default 1 */
  roll?: number;
  /** Strength of the highlight fixed to the drum's own axis (0..1). @default 0.35 */
  highlight?: number;
  /** Fill colour behind transparent texels and past the drum's curve; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_radius;
uniform float u_roll;
uniform float u_highlight;
uniform float u_progress;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 px = v_uv * u_res;
  float height = u_res.y;
  float yC = px.y - height * 0.5;
  float R = max(u_radius * height, 1.0);

  if (abs(yC) > R) {
    // Past the drum's silhouette: letterboxed page background, nothing to sample.
    o_color = vec4(u_bg.rgb, 1.0);
    return;
  }

  // The pixel's angle around the drum, the arc length that angle sweeps,
  // and the texture row that arc length lands on — a real cylindrical
  // unwrap, not a bent gradient.
  float theta = asin(clamp(yC / R, -1.0, 1.0));
  float s = theta * R;
  float v = fract((s + height * 0.5 + u_progress * height * u_roll) / height);
  float u = v_uv.x;
  vec4 tex = texture(u_tex, vec2(u, v));

  // Lambertian falloff of a lit cylinder, plus one soft highlight riding
  // the drum's own axis rather than the camera.
  float shade = cos(theta);
  float axisOffset = yC - (-0.2 * R);
  float sigma = max(R * 0.18, 1.0);
  float glow = exp(-(axisOffset * axisOffset) / (2.0 * sigma * sigma)) * u_highlight;

  vec3 shaded = tex.rgb * shade + vec3(glow);
  vec3 color = mix(u_bg.rgb, shaded, tex.a);
  o_color = vec4(color, 1.0);
}
`;

type DrumLayerProps = Required<
  Pick<CylinderRollProps, "mode" | "radius" | "roll" | "highlight">
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Walks up from the host to the first opaque background colour, so texels
 * past the drum's curve composite onto the page rather than onto black —
 * the same probe cube-fold uses for its own backdrop. */
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
 * The GL layer. Owns the context, the program, the fullscreen triangle, the
 * texture, the progress motion value and the frame loop; reads everything
 * else from the surface.
 */
function DrumLayer({
  mode,
  progress: progressProp,
  radius,
  roll,
  highlight,
  background,
}: DrumLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const progress = useMotionValue<number>(0);

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
  const paramsRef = React.useRef({ radius, roll, highlight });

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
      u_radius: p.radius,
      u_roll: p.roll,
      u_highlight: p.highlight,
      u_progress: progress.get(),
      u_bg: bg,
    });
    tri.draw();
  }, [progress]);

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
    // scroll or progress change.
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

  // Every progress change and every completed paint asks for a frame — no
  // continuous loop, this effect only reacts to the two things that can
  // change what the drum should look like.
  React.useEffect(() => {
    const unsub = progress.on("change", requestFrame);
    return unsub;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // A shape prop changed with progress otherwise static: still worth one
  // fresh frame, just not a loop.
  React.useEffect(() => {
    paramsRef.current = { radius, roll, highlight };
    requestFrame();
  }, [radius, roll, highlight, requestFrame]);

  // Resolve the fill colour against the host, so `var(--token)` reads the
  // theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // mode="manual": the prop drives the motion value directly, no spring.
  React.useEffect(() => {
    if (mode !== "manual") return;
    progress.jump(clamp01(progressProp ?? 0));
  }, [mode, progressProp, progress]);

  // mode="scroll": the motion value is springed toward the host's place in
  // the viewport on every scroll and resize.
  React.useEffect(() => {
    if (mode === "manual") return;
    const host = surface.host;
    if (!host) return;

    const computeProgress = (): number => {
      const rect = host.getBoundingClientRect();
      const vh = window.innerHeight;
      const denom = vh + rect.height;
      const raw = denom > 0 ? (vh - rect.top) / denom : 0;
      return clamp01(raw);
    };
    // Compute immediately so a host already in view rolls correctly before
    // the first scroll event ever fires.
    progress.jump(computeProgress());
    const onScroll = () => {
      animate(progress, computeProgress(), springs.glide);
    };
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [mode, surface.host, progress]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="cylinder-roll"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as the skin of a horizontal drum, turning as the page
 * scrolls past it. Every pixel maps to a real point on the cylinder: asin
 * of its distance from the vertical centre gives the angle around the
 * drum, the angle times the radius gives the arc length, and the arc
 * length plus the scroll progress gives the texture row — wrapped, so the
 * drum can turn past a full revolution and repeat the page beneath itself.
 * Shading is cos(angle), the true falloff of a lit cylinder rather than a
 * painted gradient, plus one soft highlight fixed to the drum's own axis.
 * `mode="scroll"` reads the host's place in the viewport on every scroll
 * and resize, sprung with `springs.glide`; `mode="manual"` takes the
 * number from you. A frame is requested only when progress actually
 * changes or a new paint lands — there is no continuous loop.
 * Reduced motion: SurfacePaint shows the real DOM flat and this layer
 * renders nothing.
 */
export function CylinderRoll({
  mode = "scroll",
  progress,
  radius = 0.6,
  roll = 1,
  highlight = 0.35,
  background,
  paint,
  className,
  children,
}: CylinderRollProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <DrumLayer
          mode={mode}
          progress={progress}
          radius={radius}
          roll={roll}
          highlight={highlight}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
