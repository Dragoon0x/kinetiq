"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type AmberSetProps = {
  /** Amber colour the page warms toward at the rim. @default "#c8781a" */
  tint?: string;
  /** Refraction and vignette strength. The rim samples the page up to `depth` × 12 CSS px off its true pixel, and the amber vignette mixes in at up to `depth` × 0.35. @default 1 */
  depth?: number;
  /** Visibility of the 48 seeded inclusions — 0 hides them, 1 is full strength. @default 1 */
  inclusions?: number;
  /** Idle drift speed of the inclusions, in UV units per second along each point's own hashed heading. 0 stills them and stops the tick loop. @default 0.15 */
  drift?: number;
  /** Warm top-edge glow strength. @default 0.35 */
  glow?: number;
  /** Fill colour override for wherever the painted texture is transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_depth;
uniform vec3 u_tint;
uniform float u_inclusions;
uniform float u_drift;
uniform float u_glow;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// One seeded inclusion: a bright bubble ring or a dark fleck, hashed from
// its own index, drifting on its own heading and wrapping at the border.
void addInclusion(
  int i,
  vec2 px,
  inout vec3 accumColor,
  inout float accumCoverage
) {
  float fi = float(i);
  vec2 seed = vec2(fi * 12.9898, fi * 78.233);
  vec2 basePos = vec2(kx_hash(seed), kx_hash(seed + vec2(31.7, 5.3)));
  vec2 heading = vec2(
    kx_hash(seed + vec2(7.1, 91.7)),
    kx_hash(seed + vec2(43.9, 17.2))
  ) - 0.5;
  float headingLen = length(heading);
  vec2 dir = headingLen > 0.0001 ? heading / headingLen : vec2(1.0, 0.0);
  vec2 pos = fract(basePos + dir * u_tick * u_drift);
  vec2 ptPx = pos * u_res;

  float sizeHash = kx_hash(seed + vec2(58.1, 3.7));
  float radius = mix(2.0, 4.0, sizeHash);
  float typeHash = kx_hash(seed + vec2(21.3, 64.9));
  float d = length(px - ptPx);

  float distFromRing = abs(d - radius);
  float ringMask = 1.0 - smoothstep(0.0, 1.1, distFromRing);
  float fleckRadius = radius * 0.55;
  float fleckMask = 1.0 - smoothstep(fleckRadius - 0.4, fleckRadius, d);

  bool isRing = typeHash > 0.5;
  float mask = clamp((isRing ? ringMask : fleckMask) * u_inclusions, 0.0, 1.0);
  vec3 tone = isRing ? vec3(1.0, 0.93, 0.78) : vec3(0.1, 0.05, 0.02);

  accumColor += tone * mask;
  accumCoverage += mask;
}

void main() {
  vec2 px = v_uv * u_res;

  // Refraction grows from the centre outward: the slab reads true at its
  // middle and bends the page harder near the edges, like thick resin.
  vec2 offset = (v_uv - 0.5) * u_depth * (12.0 / u_res);
  vec3 refracted = sampleOver(clamp(v_uv + offset, 0.0, 1.0));

  // Amber vignette: a base wash from depth, stronger toward the rim.
  float edge = clamp(length(v_uv - 0.5) * 1.4142, 0.0, 1.0);
  float tintAmount = clamp(u_depth * 0.35 * mix(0.4, 1.0, edge), 0.0, 1.0);
  vec3 color = mix(refracted, u_tint, tintAmount);

  // Forty-eight seeded inclusions, each drawn from its own hash.
  vec3 inclusionColor = vec3(0.0);
  float inclusionCoverage = 0.0;
  for (int i = 0; i < 48; i += 1) {
    addInclusion(i, px, inclusionColor, inclusionCoverage);
  }
  float coverage = clamp(inclusionCoverage, 0.0, 1.0);
  if (coverage > 0.0) {
    color = mix(
      color,
      inclusionColor / max(inclusionCoverage, 0.0001),
      coverage
    );
  }

  // Top glow: warm light pooling at the surface, fading down the block.
  float topGlow = pow(clamp(1.0 - v_uv.y, 0.0, 1.0), 2.0) * u_glow;
  color += vec3(1.0, 0.86, 0.6) * topGlow * 0.6;

  o_color = vec4(color, 1.0);
}
`;

type AmberLayerProps = Required<
  Pick<AmberSetProps, "tint" | "depth" | "inclusions" | "drift" | "glow">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black — the same probe crystal-lens and dust-reveal use. */
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
 * The GL layer. Owns the context, the program, the texture, the idle tick
 * and the frame loop; reads everything else from the surface. There is no
 * pointer input here — the slab is driven by time alone.
 */
function AmberLayer({
  tint,
  depth,
  inclusions,
  drift,
  glow,
  background,
}: AmberLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const tintRef = React.useRef<[number, number, number]>([0.78, 0.47, 0.1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ depth, inclusions, drift, glow });
  React.useEffect(() => {
    paramsRef.current = { depth, inclusions, drift, glow };
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

    const sized = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = sized.width / sized.dpr;
    const cssH = sized.height / sized.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_tick: tickRef.current,
      u_depth: p.depth,
      u_tint: tintRef.current,
      u_inclusions: p.inclusions,
      u_drift: p.drift,
      u_glow: p.glow,
      u_bg: bg,
    });
    tri.draw();
  }, []);

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
    // tick.
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

  // Every completed paint asks for a frame.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill and tint colours against the host's theme whenever the
  // host, the tint prop, or the background override changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    const rgba = resolveColor(tint, host);
    tintRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, background, tint, requestFrame]);

  // The continuous tick: this effect is time-driven, not pointer-driven, so
  // the loop is the whole animation, not an idle embellishment on top of a
  // pointer chase. Gated the same way as dust-reveal's idle-drift loop —
  // only while the surface is active, in view, and the tab is focused — and
  // stopped outright when there is no drift to animate.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host || drift <= 0) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so drift resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncLoop();
    });
    intersection.observe(host);
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, drift, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="amber-set"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface set in amber. Refraction bends toward the rim like thick
 * resin — the page samples further from its true pixel the closer a point
 * sits to the edge — and warms into `tint` in a vignette that deepens with
 * `depth`. Forty-eight inclusions, bright bubble rings and dark flecks each
 * seeded from their own index, drift across the block on their own hashed
 * heading and wrap at the border for as long as it stays on screen and the
 * tab stays focused. The DOM underneath sits at zero opacity, still in flow
 * and still focusable — only the amber shows.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function AmberSet({
  tint = "#c8781a",
  depth = 1,
  inclusions = 1,
  drift = 0.15,
  glow = 0.35,
  background,
  paint,
  className,
  children,
}: AmberSetProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <AmberLayer
          tint={tint}
          depth={depth}
          inclusions={inclusions}
          drift={drift}
          glow={glow}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
