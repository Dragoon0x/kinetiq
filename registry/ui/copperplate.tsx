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

export type CopperplateProps = {
  /** Distance between parallel strokes, in CSS pixels. @default 4 */
  pitch?: number;
  /** Angle of the primary hatch, in degrees; the cross-hatch runs 60° past it. @default 30 */
  angle?: number;
  /** Tone (0..1, dark = 1) above which the cross-hatch starts layering over the primary strokes. @default 0.55 */
  cross?: number;
  /** The plate colour beneath the ink. @default "#efe6d6" */
  paper?: string;
  /** The engraved line colour. @default "#2b2118" */
  ink?: string;
  /** Strength of the raking-light sheen that springs toward the pointer (0..1). @default 0.6 */
  sheen?: number;
  /** Fill for regions where the painted texture is transparent or reads as background. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_LUMA +
  /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec4 u_bg;
uniform vec3 u_paper;
uniform vec3 u_ink;
uniform float u_pitch;
uniform float u_angle;
uniform float u_cross;
uniform float u_sheen;
uniform vec2 u_pointer;
uniform float u_glow;
in vec2 v_uv;
out vec4 o_color;

const float PI = 3.14159265359;

// One tap of the tone field: 1 - luma of the pixel composited over the
// page background, zeroed wherever the paint is transparent or reads as
// that same background — blank stock never engraves.
float kx_rawTone(vec2 uv) {
  vec4 texel = texture(u_tex, clamp(uv, 0.0, 1.0));
  if (texel.a < 0.01) return 0.0;
  vec3 rgb = mix(u_bg.rgb, texel.rgb, texel.a);
  if (distance(rgb, u_bg.rgb) < 0.04) return 0.0;
  return 1.0 - kx_luma(rgb);
}

// A 3-tap blur of the tone field itself, not the source texture, so a
// letterform's hard antialiasing softens into a clean line weight.
float kx_tone(vec2 uv) {
  vec2 texel = vec2(1.0, 0.0) / u_res;
  float t0 = kx_rawTone(uv - texel);
  float t1 = kx_rawTone(uv);
  float t2 = kx_rawTone(uv + texel);
  return t0 * 0.25 + t1 * 0.5 + t2 * 0.25;
}

// One family of parallel engraved strokes at angleDeg, its line weight
// ramping from hairline to solid as t runs 0..1 — line1 and line2 both run
// through this, just at different angles and different tone inputs.
float kx_strokes(vec2 px, float angleDeg, float t) {
  float a = radians(angleDeg);
  float r = dot(px, vec2(cos(a), sin(a)));
  float band = 0.5 + 0.5 * sin(r * 2.0 * PI / u_pitch);
  return smoothstep(1.0 - t - 0.12, 1.0 - t + 0.12, band) * step(0.02, t);
}

void main() {
  vec2 px = v_uv * u_res;
  float tone = kx_tone(v_uv);

  float line1 = kx_strokes(px, u_angle, tone);
  float tone2 = clamp((tone - u_cross) / max(1.0 - u_cross, 0.0001), 0.0, 1.0);
  float line2 = kx_strokes(px, u_angle + 60.0, tone2);
  float ink = max(max(line1, line2), smoothstep(0.72, 0.95, tone));

  vec3 color = mix(u_paper, u_ink, ink);

  // The pointer's own sheen: a soft raking-light highlight that only ever
  // adds white, strongest at the sprung centre and gone within a couple of
  // hundred pixels.
  vec2 d = px - u_pointer;
  float sheenAmt = 0.12 * u_sheen * u_glow * exp(-dot(d, d) / (2.0 * 220.0 * 220.0));
  color += vec3(sheenAmt);

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent region reads as the real page colour
 * rather than black — the same probe crystal-lens uses for its own. */
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
  );
}

type PlateLayerProps = Required<
  Pick<
    CopperplateProps,
    "pitch" | "angle" | "cross" | "paper" | "ink" | "sheen"
  >
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the texture, the pointer's
 * sprung position and sheen, and the frame loop; reads everything else from
 * the surface.
 */
function PlateLayer({
  pitch,
  angle,
  cross,
  paper,
  ink,
  sheen,
  background,
}: PlateLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // The sheen's sprung centre, in host-relative CSS px, and its own
  // sprung visibility — both settle to rest and stop asking for frames.
  const pointerX = useMotionValue<number>(-9999);
  const pointerY = useMotionValue<number>(-9999);
  const glow = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const paperRef = React.useRef<[number, number, number]>([
    0.9373, 0.902, 0.8392,
  ]);
  const inkRef = React.useRef<[number, number, number]>([
    0.1686, 0.1294, 0.0941,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ pitch, angle, cross, sheen });
  React.useEffect(() => {
    paramsRef.current = { pitch, angle, cross, sheen };
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
      u_bg: bg,
      u_paper: paperRef.current,
      u_ink: inkRef.current,
      u_pitch: p.pitch,
      u_angle: p.angle,
      u_cross: p.cross,
      u_sheen: p.sheen,
      u_pointer: [pointerX.get(), pointerY.get()],
      u_glow: glow.get(),
    });
    tri.draw();
  }, [pointerX, pointerY, glow]);

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

  // The sprung pointer and its sprung glow ask for a frame on every tick
  // while either settles, and stop asking the moment both are at rest —
  // that's the whole loop, never a continuous idle tick.
  React.useEffect(() => {
    const unsubs = [pointerX, pointerY, glow].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [pointerX, pointerY, glow, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours resolve against the host once it exists, and again whenever the
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const paperRgba = resolveColor(paper, host);
    paperRef.current = [paperRgba[0], paperRgba[1], paperRgba[2]];
    const inkRgba = resolveColor(ink, host);
    inkRef.current = [inkRgba[0], inkRgba[1], inkRgba[2]];
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, paper, ink, background, requestFrame]);

  // Pointer on the host: spring the sheen's centre toward it and its glow
  // toward 1 while inside, spring the glow back to 0 the moment it leaves.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      // A fresh approach starts under the pointer rather than gliding in
      // from wherever it last rested.
      pointerX.jump(event.clientX - rect.left);
      pointerY.jump(event.clientY - rect.top);
      animate(glow, 1, springs.glide);
    };
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(pointerX, event.clientX - rect.left, springs.glide);
      animate(pointerY, event.clientY - rect.top, springs.glide);
      if (glow.get() < 1) animate(glow, 1, springs.glide);
    };
    const leave = () => {
      animate(glow, 0, springs.glide);
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
  }, [surface.host, pointerX, pointerY, glow]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="copperplate"
      className="block h-full w-full"
    />
  );
}

/**
 * The live interface printed as a copper engraving: every pixel's blurred
 * tone — one minus its luminance, zeroed anywhere the paint is transparent
 * or reads as the page's own background — sets a line weight, hatched
 * across the page at `angle` and, past `cross`, cross-hatched a second time
 * 60° over it, the same two-plate trick an engraver uses to darken a shadow
 * without ever laying down a solid fill. Rest the pointer anywhere and a
 * soft white sheen springs to it, standing in for the raking light off a
 * polished plate, and springs back to nothing the instant the cursor
 * leaves. Every stroke reads straight off the painted texture; nothing here
 * is seeded or simulated beyond that one sheen spring.
 * Reduced motion: `SurfacePaint` renders in replace mode, so this layer
 * returns null and the real, unengraved DOM shows in its place.
 */
export function Copperplate({
  pitch = 4,
  angle = 30,
  cross = 0.55,
  paper = "#efe6d6",
  ink = "#2b2118",
  sheen = 0.6,
  background,
  paint,
  className,
  children,
}: CopperplateProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PlateLayer
          pitch={pitch}
          angle={angle}
          cross={cross}
          paper={paper}
          ink={ink}
          sheen={sheen}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
