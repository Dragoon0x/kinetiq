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

export type ReedOrientation = "vertical" | "horizontal";

export type ReededGlassProps = {
  /** Spacing between flute centres, in CSS px. @default 14 */
  pitch?: number;
  /** How far a flute's crest bends the texture across its own width, in CSS px. @default 6 */
  depth?: number;
  /** Which way the flutes run. @default "vertical" */
  orientation?: ReedOrientation;
  /** Specular strength riding each flute's crest (0..1). @default 0.5 */
  highlight?: number;
  /** How much the pane sees straight through versus bends, 0..1 — 1 flattens the refraction to nothing. @default 0.65 */
  clarity?: number;
  /** Fill colour where the painted texture is transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_pitch;
uniform float u_depth;
uniform float u_clarity;
uniform float u_highlight;
uniform float u_phase;
uniform float u_vertical;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  // vertical flutes read their position from x (crossing a flute moves
  // left/right); horizontal flutes read it from y.
  float axisCoord = mix(px.y, px.x, u_vertical);
  float pitch = max(u_pitch, 1.0);
  float f = fract((axisCoord + u_phase) / pitch) - 0.5;

  // A half-cylinder rib: the cross-axis component of its surface normal
  // sweeps -1..1 across one flute, and the depth component completes it.
  float nAxis = f * 2.0;
  float nz = sqrt(clamp(1.0 - nAxis * nAxis, 0.0, 1.0));

  float offsetAmount = nAxis * u_depth * (1.0 - u_clarity);
  vec2 offsetDir = mix(vec2(0.0, 1.0), vec2(1.0, 0.0), u_vertical);
  vec3 color = sampleOver(v_uv + offsetDir * offsetAmount / u_res);

  // Round shading across the tube: brightest at the crest (nz near 1),
  // dimming toward either edge.
  color *= mix(0.8, 1.0, nz);

  // A glint riding the crest itself.
  float rib = pow(clamp(1.0 - abs(nAxis), 0.0, 1.0), 8.0) * u_highlight;
  color += rib;

  // A faint dark line where two flutes meet.
  float seamDist = 0.5 - abs(f);
  float seam = 1.0 - smoothstep(0.0, 0.03, seamDist);
  color *= mix(1.0, 0.82, seam);

  o_color = vec4(color, 1.0);
}
`;

type ReedLayerProps = Required<
  Pick<
    ReededGlassProps,
    "pitch" | "depth" | "orientation" | "highlight" | "clarity"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * flute sampled over a transparent region of the painted texture
 * composites onto the page rather than onto black — the same probe
 * crystal-lens and pond-glass use for their own backdrops. */
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
 * The GL layer. Owns the context, the program, the texture, the phase
 * spring and the frame loop; reads everything else from the surface.
 */
function ReedLayer({
  pitch,
  depth,
  orientation,
  highlight,
  clarity,
  background,
}: ReedLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const phase = useMotionValue<number>(0);

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
  const paramsRef = React.useRef({
    pitch,
    depth,
    orientation,
    highlight,
    clarity,
  });
  React.useEffect(() => {
    paramsRef.current = { pitch, depth, orientation, highlight, clarity };
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
      u_pitch: p.pitch,
      u_depth: p.depth,
      u_clarity: p.clarity,
      u_highlight: p.highlight,
      u_phase: phase.get(),
      u_vertical: p.orientation === "vertical" ? 1 : 0,
      u_bg: bg,
    });
    tri.draw();
  }, [phase]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // replace mode), so this is keyed on `surface.active`, not on mount — a
  // mount-only effect would run against no canvas at all.
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

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The phase spring drives its own loop: every settling tick fires a
  // "change" event that asks for a frame, and once the spring reaches its
  // target the events stop, so the loop stops with them — nothing here
  // ticks on its own.
  React.useEffect(() => {
    const unsubscribe = phase.on("change", requestFrame);
    return () => unsubscribe();
  }, [phase, requestFrame]);

  // Pointer on the host: spring the phase toward the pointer's position
  // along the cross-flute axis, so the slivers slide as it moves.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const coord = paramsRef.current.orientation === "vertical" ? px : py;
      animate(phase, coord * 0.25, springs.glide);
    };

    host.addEventListener("pointermove", move);
    return () => {
      host.removeEventListener("pointermove", move);
    };
  }, [surface.host, background, phase]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="reeded-glass"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface behind fluted glass: a run of half-cylinder ribs, `pitch`
 * pixels apart, each bending the texture beneath it sideways across its own
 * width by an amount that peaks at the rib's crest and falls to nothing at
 * its seam — the same thing a real reeded pane does to whatever sits behind
 * it. A rounded shading term and a crest-riding glint give each rib its
 * roundness, and a faint dark seam marks where two ribs meet. The whole
 * pattern's phase is a spring chasing the pointer along the cross-flute
 * axis, so the slivers slide as the cursor sweeps past and settle once it
 * stops moving.
 * Reduced motion: the real DOM shows in full and this layer renders
 * nothing.
 */
export function ReededGlass({
  pitch = 14,
  depth = 6,
  orientation = "vertical",
  highlight = 0.5,
  clarity = 0.65,
  background,
  paint,
  className,
  children,
}: ReededGlassProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <ReedLayer
          pitch={pitch}
          depth={depth}
          orientation={orientation}
          highlight={highlight}
          clarity={clarity}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
