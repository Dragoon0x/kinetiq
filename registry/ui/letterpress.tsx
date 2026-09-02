"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
  GLSL_NOISE,
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

export type LetterpressProps = {
  /** How deep the impression reads — larger softens the relief, smaller sharpens it. @default 1.2 */
  depth?: number;
  /** Paper grain strength. @default 0.5 */
  tooth?: number;
  /** The paper's own colour, any CSS colour (tokens included). @default "#f3ede2" */
  paper?: string;
  /** The ink's colour, any CSS colour (tokens included). @default "#1d1a17" */
  ink?: string;
  /** Height of the pointer lamp above the sheet, in CSS pixels. @default 240 */
  lightRadius?: number;
  /** Fill for whatever the painted texture leaves transparent, and the near-page colour excluded from the ink mask. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_texel;
uniform vec3 u_light;
uniform float u_depth;
uniform float u_tooth;
uniform vec4 u_paper;
uniform vec4 u_ink;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_LUMA}

// Ink density at one texel of the painted texture: dark, opaque, non-page
// paint reads as ink; a transparent gap or a fill that only repeats the
// page's own background colour reads as bare paper (0). Keeping both tests
// here means every caller of this function — the centre sample and its
// four neighbours below — sees the same rule.
float inkAt(vec2 uv) {
  vec4 raw = texture(u_tex, clamp(uv, 0.0, 1.0));
  vec3 over = mix(u_bg.rgb, raw.rgb, raw.a);
  if (raw.a < 0.01 || distance(over, u_bg.rgb) < 0.04) return 0.0;
  return smoothstep(0.25, 0.85, 1.0 - kx_luma(over));
}

void main() {
  vec2 px = v_uv * u_res;

  // A relief normal built from the ink mask's own gradient, sampled one
  // texel either side of centre in each axis — a central difference over
  // the source texture, not a screen-space derivative, so the relief
  // tracks the painted texture's own resolution rather than the canvas'.
  float m = inkAt(v_uv);
  float mL = inkAt(v_uv - vec2(u_texel.x, 0.0));
  float mR = inkAt(v_uv + vec2(u_texel.x, 0.0));
  float mU = inkAt(v_uv - vec2(0.0, u_texel.y));
  float mD = inkAt(v_uv + vec2(0.0, u_texel.y));
  vec2 grad = vec2(mR - mL, mD - mU) * 0.5;
  vec3 normal = normalize(vec3(-grad, 1.0 / max(u_depth, 0.01)));

  // The sprung pointer stands in for a lamp held u_light.z above the sheet;
  // this pixel's own position is the sheet itself, at height 0.
  vec3 lightDir = normalize(vec3(u_light.xy - px, u_light.z));
  float diffuse = dot(normal, lightDir);

  // Paper tooth: a hashed grain seeded from the fragment's own position, so
  // it holds still under the light rather than swimming with it, and shows
  // through under ink exactly as it does over bare paper.
  float grain = (kx_hash(px) - 0.5) * u_tooth * 0.08;
  vec3 paper = u_paper.rgb + vec3(grain);

  vec3 color = paper * (1.0 - m * 0.85) + u_ink.rgb * m;

  // Only the ink's own boundary catches a highlight or a shadow — flat
  // paper and the flat ink interior stay unlit either way. The threshold
  // from the brief (|grad m| > 0.05) is softened into a short smoothstep
  // ramp so the seam doesn't alias as the light sweeps across it.
  float boundary = smoothstep(0.02, 0.06, length(grad));
  color += vec3(1.0) * (0.35 * max(diffuse - 0.6, 0.0) * 2.5) * boundary;
  color *= 1.0 - 0.35 * max(0.6 - diffuse, 0.0) * boundary;

  o_color = vec4(color, 1.0);
}
`;

type LetterpressLayerProps = Required<
  Pick<LetterpressProps, "depth" | "tooth" | "paper" | "ink" | "lightRadius">
> & { background?: string };

/** Walks up from the host to the first opaque background colour — the same
 * probe crystal-lens and crushed-foil use for their own backdrop. */
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

// Sentinel light position, far enough outside any canvas that its direction
// reads as a fixed, near-grazing rest light — the same off-screen relax
// crushed-foil uses for its own pointer spring.
const OFFSCREEN = -9999;

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function LetterpressLayer({
  depth,
  tooth,
  paper,
  ink,
  lightRadius,
  background,
}: LetterpressLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(OFFSCREEN);
  const y = useMotionValue<number>(OFFSCREEN);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const paperRef = React.useRef<[number, number, number, number]>([
    0.95, 0.93, 0.89, 1,
  ]);
  const inkRef = React.useRef<[number, number, number, number]>([
    0.11, 0.1, 0.09, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ depth, tooth, lightRadius });
  React.useEffect(() => {
    paramsRef.current = { depth, tooth, lightRadius };
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
    const paperColor = paperRef.current;
    gl.clearColor(paperColor[0], paperColor[1], paperColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_texel: [
        1 / Math.max(1, live.canvas.width),
        1 / Math.max(1, live.canvas.height),
      ],
      u_light: [x.get(), y.get(), p.lightRadius],
      u_depth: p.depth,
      u_tooth: p.tooth,
      u_paper: paperColor,
      u_ink: inkRef.current,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // this replace-mode effect), so this is keyed on `surface.active`, not on
  // mount — a mount-only effect would run against no canvas at all.
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

  // Every motion-value change asks for a frame — the pointer spring settles
  // on its own, so this alone is the whole loop: no idle tick to gate, and
  // it stops the moment x and y stop changing.
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
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    paperRef.current = resolveColor(paper, host);
    inkRef.current = resolveColor(ink, host);
    requestFrame();
  }, [surface.host, background, paper, ink, requestFrame]);

  // Pointer on the host: spring the lamp toward the cursor on springs.glide,
  // snap it in on entry so the first hit never sweeps in from the offscreen
  // sentinel, and spring it back out on exit so the light settles to its
  // fixed raking rest angle rather than jumping there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.glide);
      animate(y, event.clientY - rect.top, springs.glide);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
    };
    const leave = () => {
      animate(x, OFFSCREEN, springs.glide);
      animate(y, OFFSCREEN, springs.glide);
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
  }, [surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="letterpress"
      className="block h-full w-full"
    />
  );
}

/**
 * The page pressed into a sheet of paper. The ink mask comes straight from
 * the painted texture's own luma — dark, opaque strokes read as pressed
 * impressions, transparent gaps and page-coloured fills read as bare
 * paper — and its gradient, sampled one texel either side of every pixel,
 * becomes a relief normal via `depth`. The sprung pointer stands in for a
 * lamp held `lightRadius` CSS px above the sheet, so hovering rakes light
 * across every letterform: a white highlight where a stroke's edge tilts
 * toward the lamp, a soft shadow where it tilts away. A hashed grain seeded
 * from each pixel's own position gives the paper its `tooth`, present
 * everywhere, under ink and off it alike. Nothing about the page itself
 * moves — only the light does, and it settles back to a fixed rest angle
 * once the pointer leaves.
 * Reduced motion: replace mode renders nothing here and the real, flat DOM
 * shows in its place.
 */
export function Letterpress({
  depth = 1.2,
  tooth = 0.5,
  paper = "#f3ede2",
  ink = "#1d1a17",
  lightRadius = 240,
  background,
  paint,
  className,
  children,
}: LetterpressProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <LetterpressLayer
          depth={depth}
          tooth={tooth}
          paper={paper}
          ink={ink}
          lightRadius={lightRadius}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
