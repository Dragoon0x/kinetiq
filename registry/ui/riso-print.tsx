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

export type RisoPrintProps = {
  /** First ink, printed for mid and dark tones. CSS colour, resolved with `resolveColor`. @default "#ff5a36" */
  ink1?: string;
  /** Second ink, printed only for the darkest tones, over the first. CSS colour. @default "#1d4ed8" */
  ink2?: string;
  /** The stock beneath both inks. CSS colour. @default "#f5efe3" */
  paper?: string;
  /** Peak plate misregistration, in CSS pixels. @default 3 */
  offset?: number;
  /** Paper-grain strength (0..1). @default 0.2 */
  grain?: number;
  /** Stencil-edge softness (0..1). @default 0.3 */
  soft?: number;
  /** Fill colour override for wherever the painted texture samples transparent; defaults to the host's own effective background. */
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
uniform vec2 u_reg1;
uniform vec2 u_reg2;
uniform vec4 u_ink1;
uniform vec4 u_ink2;
uniform vec4 u_paper;
uniform float u_grain;
uniform float u_soft;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// One plate's coverage, sampled from the source shifted by its own
// registration offset: dark tones read as ink, ramped between e0 (where
// coverage starts) and e1 (fully inked).
float kx_plateCoverage(vec2 uv, vec2 offPx, float e0, float e1) {
  vec2 shifted = uv - offPx / u_res;
  float luma = kx_luma(sampleOver(shifted));
  return smoothstep(e0, e1, 1.0 - luma);
}

// A 3-tap blur of the coverage mask itself, not the source texture, so the
// stencil edge softens without softening the interface it is printed from.
float kx_softPlate(vec2 uv, vec2 offPx, float e0, float e1, float softPx) {
  vec2 texel = vec2(softPx, 0.0) / u_res;
  float c0 = kx_plateCoverage(uv - texel, offPx, e0, e1);
  float c1 = kx_plateCoverage(uv, offPx, e0, e1);
  float c2 = kx_plateCoverage(uv + texel, offPx, e0, e1);
  return c0 * 0.25 + c1 * 0.5 + c2 * 0.25;
}

void main() {
  vec2 px = v_uv * u_res;
  float softPx = clamp(u_soft, 0.0, 1.0) * 6.0;

  // Mid and dark tones stamp plate 1; only the darkest stamp plate 2 over
  // it. Fixed thresholds — the two-plate split is what makes this a riso
  // print rather than a generic duotone.
  float c1 = kx_softPlate(v_uv, u_reg1, 0.35, 0.75, softPx);
  float c2 = kx_softPlate(v_uv, u_reg2, 0.7, 1.0, softPx);

  float speck = kx_hash(px);
  vec3 paperColor = clamp(
    u_paper.rgb + (speck - 0.5) * u_grain * 0.5,
    0.0,
    1.0
  );

  // Ink multiplies onto the stock — it can only darken it, never lighten
  // it, the way real riso ink behaves.
  vec3 platesMul = mix(vec3(1.0), u_ink1.rgb, c1) * mix(vec3(1.0), u_ink2.rgb, c2);
  vec3 color = paperColor * platesMul;

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type PrintLayerProps = Required<
  Pick<RisoPrintProps, "ink1" | "ink2" | "paper" | "offset" | "grain" | "soft">
> & { background?: string };

/** A tiny, deterministic integer hash for the registration schedule — the
 * same seed always yields the same direction. No Math.random. Mirrors
 * signal-glitch's own copy of the same idea. */
function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Plate 1's registration vector for a seed: a hashed direction at a fixed
 * length of `offsetPx`. Plate 2 always sits at the exact opposite. */
function registrationVector(
  seed: number,
  offsetPx: number,
): { x: number; y: number } {
  const angle = hash01(seed) * Math.PI * 2;
  return { x: Math.cos(angle) * offsetPx, y: Math.sin(angle) * offsetPx };
}

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent region composites onto the real page
 * rather than onto black — the same probe crystal-lens and signal-glitch
 * use for their own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture, the pair of
 * registration motion values, and the frame loop; reads everything else
 * from the surface.
 */
function PrintLayer({
  ink1,
  ink2,
  paper,
  offset,
  grain,
  soft,
  background,
}: PrintLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Plate 1's current registration offset, in CSS px. Plate 2 is always its
  // negation, read at draw time — one pair of motion values covers both.
  const regX = useMotionValue<number>(0);
  const regY = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const ink1Ref = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const ink2Ref = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const paperRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const seedRef = React.useRef(0);
  const regXControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const regYControls = React.useRef<ReturnType<typeof animate> | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ offset, grain, soft });
  React.useEffect(() => {
    paramsRef.current = { offset, grain, soft };
  }, [offset, grain, soft]);

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
    const rx = regX.get();
    const ry = regY.get();
    program.set({
      u_res: [cssW, cssH],
      u_reg1: [rx, ry],
      u_reg2: [-rx, -ry],
      u_ink1: ink1Ref.current,
      u_ink2: ink2Ref.current,
      u_paper: paperRef.current,
      u_grain: p.grain,
      u_soft: p.soft,
      u_bg: bg,
    });
    tri.draw();
  }, [regX, regY]);

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
    // pointerdown.
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

  // The registration slide and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between clicks.
  React.useEffect(() => {
    const unsubX = regX.on("change", requestFrame);
    const unsubY = regY.on("change", requestFrame);
    return () => {
      unsubX();
      unsubY();
    };
  }, [regX, regY, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the two inks, the paper, and the transparent-texel fallback
  // against the host, so `var(--token)` reads the theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    ink1Ref.current = resolveColor(ink1, host);
    ink2Ref.current = resolveColor(ink2, host);
    paperRef.current = resolveColor(paper, host);
    bgRef.current = effectiveBackground(host, background);
    requestFrame();
  }, [surface.host, ink1, ink2, paper, background, requestFrame]);

  // Plate 1's resting registration for seed 0, set once the host exists —
  // a jump, not a slide, since nothing has re-registered yet.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rest = registrationVector(seedRef.current, paramsRef.current.offset);
    regX.jump(rest.x);
    regY.jump(rest.y);
  }, [surface.host, regX, regY]);

  // pointerdown re-registers: the seed advances, a fresh hashed direction is
  // drawn, and both plates slide from their old offset to the new one over
  // a quarter second. The listener lives on the host, never the canvas.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const down = () => {
      seedRef.current += 1;
      const target = registrationVector(
        seedRef.current,
        paramsRef.current.offset,
      );
      regXControls.current?.stop();
      regYControls.current?.stop();
      regXControls.current = animate(regX, target.x, {
        duration: 0.25,
        ease: easings.move,
      });
      regYControls.current = animate(regY, target.y, {
        duration: 0.25,
        ease: easings.move,
      });
    };
    host.addEventListener("pointerdown", down);
    return () => host.removeEventListener("pointerdown", down);
  }, [surface.host, regX, regY]);

  // A slide in flight must not outlive the component.
  React.useEffect(
    () => () => {
      regXControls.current?.stop();
      regYControls.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="riso-print"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface reproduced as a two-plate risograph print. Luminance alone
 * decides ink: mid and dark tones stamp the first plate, only the darkest
 * stamp the second over it, each one multiplying down onto the paper colour
 * — ink can darken the stock but never lighten it, the way real riso ink
 * behaves. The two plates never sit perfectly true: each carries its own
 * registration offset, a hashed direction at a fixed distance from centre,
 * with the second plate always opposite the first. A pointerdown
 * re-registers both plates — a fresh hashed direction, seeded from a
 * running click count — and the offsets slide from their old position to
 * the new one over a quarter second; nothing redraws between clicks. A
 * per-pixel hash grains the stock, and a three-tap blur of each plate's own
 * coverage mask softens the stencil edge without softening the interface it
 * is printed from.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function RisoPrint({
  ink1 = "#ff5a36",
  ink2 = "#1d4ed8",
  paper = "#f5efe3",
  offset = 3,
  grain = 0.2,
  soft = 0.3,
  background,
  paint,
  className,
  children,
}: RisoPrintProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PrintLayer
          ink1={ink1}
          ink2={ink2}
          paper={paper}
          offset={offset}
          grain={grain}
          soft={soft}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
