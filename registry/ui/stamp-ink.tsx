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
import { easings } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type StampInkProps = {
  /** The ink colour. CSS colour, resolved with `resolveColor`. @default "#b3261e" */
  color?: string;
  /** How unevenly the stamp presses — noise and tilt strength in the pressure field. @default 0.8 */
  unevenness?: number;
  /** How far the smudge trail drags behind the ink, in CSS pixels. @default 3 */
  smudge?: number;
  /** A faint rounded outline a few pixels in from the canvas, like a stamp's own housing. @default true */
  block?: boolean;
  /** Fill colour for wherever the painted texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_NOISE +
  GLSL_LUMA +
  /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_seed;
uniform float u_unevenness;
uniform float u_smudge;
uniform float u_press;
uniform float u_block;
uniform vec4 u_color;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

// Ink only takes where the page has something darker than its own
// background to give it: 0 wherever the texture is transparent, or where
// the composited colour sits within 0.04 of u_bg.
float kx_inkMask(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  vec3 composited = mix(u_bg.rgb, t.rgb, t.a);
  float luma = kx_luma(composited);
  float m = smoothstep(0.3, 0.85, 1.0 - luma);
  if (t.a < 0.01 || distance(composited, u_bg.rgb) < 0.04) m = 0.0;
  return m;
}

// Signed distance to a centred rounded rectangle, for the block edge.
float kx_sdRoundRect(vec2 p, vec2 halfSize, float r) {
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 center = u_res * 0.5;
  vec2 raw = v_uv * u_res;

  // The press animation scales the sampling about the centre: a brief 2%
  // punch-in that eases back to true over 0.2s, then holds still.
  float pressScale = max(u_press, 0.05);
  vec2 px = center + (raw - center) / pressScale;

  // A per-seed tilt direction — the angle the block leaned that click.
  vec2 tilt = vec2(cos(u_seed * 2.4), sin(u_seed * 2.4));

  // Pressure: a resting 0.6, pushed by a low-frequency noise field (the
  // uneven give of the rubber) and by how far this pixel sits toward the
  // tilt direction from centre (the lean of the hand).
  float fbm = kx_fbm(px * 0.003 + u_seed * 7.31);
  float lean = dot(px / u_res - 0.5, tilt);
  float pressure = clamp(
    0.6 + 0.4 * ((fbm - 0.5) * 2.0 * u_unevenness) + lean * 0.5 * u_unevenness,
    0.0,
    1.0
  );

  float m = kx_inkMask(px / u_res);
  float smudgeMask = kx_inkMask((px - tilt * u_smudge) / u_res);

  float inkAlpha = clamp(m * pressure + smudgeMask * 0.3, 0.0, 1.0);
  vec3 color = mix(u_bg.rgb, u_color.rgb, inkAlpha);

  if (u_block > 0.5) {
    vec2 halfSize = center - 6.0;
    float r = clamp(10.0, 0.0, min(halfSize.x, halfSize.y));
    float dist = abs(kx_sdRoundRect(raw - center, halfSize, r));
    float edge = 1.0 - smoothstep(0.0, 1.5, dist);
    color = mix(color, u_color.rgb, edge * 0.25);
  }

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type StampLayerProps = Required<
  Pick<StampInkProps, "color" | "unevenness" | "smudge" | "block">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent region composites onto the real page
 * rather than onto black — the same probe crystal-lens and riso-print use
 * for their own backdrop. `background`, when given, may itself hold a
 * `var(--token)`, so it is resolved against the host's own theme. */
function effectiveBackground(
  el: HTMLElement | null,
  override?: string,
): [number, number, number, number] {
  if (override) return resolveColor(override, el);
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
 * The GL layer. Owns the context, the program, the texture, the click
 * counter and the press motion value; reads everything else from the
 * surface.
 */
function StampLayer({
  color,
  unevenness,
  smudge,
  block,
  background,
}: StampLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1.02 at the instant of a click, easing to 1 over 0.2s, then holding.
  const press = useMotionValue<number>(1);
  const pressControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  // The seed: owned entirely by clicks, read straight into the shader.
  const seedRef = React.useRef(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ unevenness, smudge, block });
  React.useEffect(() => {
    paramsRef.current = { unevenness, smudge, block };
  });

  // One frame: upload the texture if a new paint landed, then draw the
  // current seed and press value.
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
      u_seed: seedRef.current,
      u_unevenness: p.unevenness,
      u_smudge: p.smudge,
      u_press: press.get(),
      u_block: p.block ? 1 : 0,
      u_color: colorRef.current,
      u_bg: bg,
    });
    tri.draw();
  }, [press]);

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
    // click.
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

  // The press value asks for a frame only while it is actually changing —
  // once the 0.2s ease completes, nothing fires and the loop falls silent.
  React.useEffect(() => {
    const unsubscribe = press.on("change", requestFrame);
    return unsubscribe;
  }, [press, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // A prop change redraws once with the current seed and press value — no
  // loop starts, just one more frame.
  React.useEffect(() => {
    requestFrame();
  }, [unevenness, smudge, block, requestFrame]);

  // Resolve the ink colour and the transparent-texel fallback against the
  // host, so `var(--token)` reads the theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    bgRef.current = effectiveBackground(host, background);
    requestFrame();
  }, [surface.host, color, background, requestFrame]);

  // pointerdown on the host: the seed advances, and the press value snaps
  // to a 2% punch-in that eases back to true over 0.2s — one press, then
  // still until the next click.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const down = () => {
      seedRef.current += 1;
      pressControlsRef.current?.stop();
      pressControlsRef.current = animate(press, [1.02, 1], {
        duration: 0.2,
        ease: easings.move,
      });
    };
    host.addEventListener("pointerdown", down);
    return () => host.removeEventListener("pointerdown", down);
  }, [surface.host, press]);

  // A press in flight must not outlive the component.
  React.useEffect(
    () => () => {
      pressControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="stamp-ink"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface pressed onto the page like a rubber stamp inked unevenly.
 * A luminance mask decides what takes ink at all — dark content prints,
 * blank paper and anything within a hair of the background colour stays
 * bare — while a pressure field decides how hard it lands: a low-frequency
 * noise term plus a directional lean, both scaled by `unevenness`, so no
 * two clicks press quite the same way. Every click advances a seed that
 * redraws the tilt direction and the noise, and drags a faint smudge trail
 * behind the ink along that same tilt; a `block` edge, when on, prints a
 * faint rounded outline a few pixels in from the canvas, the way a stamp's
 * own housing leaves a ghost of its shape. The press itself is quick:
 * sampling punches in by 2% and eases back to true over 0.2s, then the
 * canvas holds still until the next click.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function StampInk({
  color = "#b3261e",
  unevenness = 0.8,
  smudge = 3,
  block = true,
  background,
  paint,
  className,
  children,
}: StampInkProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <StampLayer
          color={color}
          unevenness={unevenness}
          smudge={smudge}
          block={block}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
