"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFigureStage,
  createPostPass,
  loadFigureRuntime,
  type FigurePreset,
  type FigureStage,
} from "@/registry/lib/figure";
import { resolveColor } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";

export type DitherFigurePattern = "bayer" | "halftone" | "hatch" | "dash";

export type DitherFigureProps = {
  /** Which built-in figure to show; ignored once `src` is set. @default "knot" */
  preset?: FigurePreset;
  /** A GLB/glTF, SVG, or raster image URL, sniffed from its bytes — overrides `preset`. */
  src?: string;
  /** Extra multiplier over the figure's normalised fit. @default 1 */
  scale?: number;
  /** Dither cell size, in device pixels. @default 3 */
  pixelSize?: number;
  /** Gray levels the quantiser resolves to. @default 2 */
  levels?: number;
  /** Luminance contrast before thresholding. @default 0.6 */
  contrast?: number;
  /** The threshold geometry the dither reads. @default "bayer" */
  pattern?: DitherFigurePattern;
  /** The low end of the quantised mix, resolved through the real cascade so tokens work. @default "var(--ink)" */
  darkColor?: string;
  /** The high end of the quantised mix, resolved through the real cascade so tokens work. @default "var(--color-surface-0)" */
  lightColor?: string;
  /** Drag to orbit the figure. Forced off under reduced motion. @default true */
  orbit?: boolean;
  /** Float and gently rock the figure at rest. Forced off under reduced motion. @default true */
  idle?: boolean;
  className?: string;
  /** Rendered under the canvas as a caption slot. */
  children?: React.ReactNode;
  /** Host height in px. @default 360 */
  height?: number;
};

const PATTERN_INDEX: Record<DitherFigurePattern, number> = {
  bayer: 0,
  halftone: 1,
  hatch: 2,
  dash: 3,
};

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uPixelSize;
uniform float uLevels;
uniform float uContrast;
uniform float uPattern;
uniform vec3 uDark;
uniform vec3 uLight;
in vec2 vUv;
out vec4 outColor;

float df_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// A fixed 8x8 Bayer threshold from the classic bit-interleaving closed form
// (Bayer2 -> Bayer4 -> Bayer8) rather than a lookup table, so there is never
// a non-constant array index. The matrix never moves, so the same screen
// cell always dithers to the same threshold.
float df_bayer2(vec2 a) {
  vec2 f = floor(a);
  return fract(f.x * 0.5 + f.y * f.y * 0.75);
}
float df_bayerThreshold(vec2 cell) {
  vec2 c = mod(cell, 8.0);
  float b2 = df_bayer2(c);
  float b4 = df_bayer2(c * 0.5) * 0.25 + b2;
  float b8 = df_bayer2(c * 0.25) * 0.25 + b4;
  return b8;
}

float df_tri(float x) {
  float f = fract(x);
  return 1.0 - abs(f * 2.0 - 1.0);
}

// Per-pattern threshold in [0,1) at this fragment's position inside its
// pixelSize cell, compared against luminance to decide dark vs. light.
float df_threshold(vec2 cell, vec2 local, float half_) {
  if (uPattern < 0.5) {
    return df_bayerThreshold(cell);
  } else if (uPattern < 1.5) {
    // halftone: grows outward from the cell centre, like a printed dot.
    float d = length(local) / max(half_, 0.001);
    return clamp(d, 0.0, 1.0);
  } else if (uPattern < 2.5) {
    // hatch: a diagonal coverage ramp, engraving-style.
    return df_tri((local.x + local.y) / max(half_ * 2.0, 0.001));
  } else {
    // dash: horizontal coverage, blanked on alternating cell rows.
    float t = df_tri(local.x / max(half_ * 2.0, 0.001));
    float rowGap = mod(cell.y, 2.0);
    return mix(t, 1.0, rowGap);
  }
}

void main() {
  vec2 px = vUv * uRes;
  float cellSize = max(uPixelSize, 1.0);
  vec2 cell = floor(px / cellSize);
  vec2 cellCenter = (cell + 0.5) * cellSize;
  vec2 local = px - cellCenter;
  float half_ = cellSize * 0.5;

  vec4 scene = texture(tScene, cellCenter / uRes);
  if (scene.a < 0.05) {
    outColor = vec4(0.0);
    return;
  }

  float lum = df_luma(scene.rgb);
  lum = clamp((lum - 0.5) * (1.0 + uContrast) + 0.5, 0.0, 1.0);

  float t = df_threshold(cell, local, half_);
  float steps = max(uLevels - 1.0, 1.0);
  float scaled = lum * steps + (t - 0.5);
  float q = clamp(floor(scaled + 0.5), 0.0, steps) / steps;

  outColor = vec4(mix(uDark, uLight, q), scene.a);
}
`;

/**
 * A three.js figure — a torus knot by default — pushed through an ordered
 * dither: the lit render is quantised against a fixed 8×8 Bayer threshold
 * (or a halftone, hatch, or dash pattern) into `levels` steps and repainted
 * as `darkColor`/`lightColor`. The matrix itself never moves, so the same
 * patch of the figure always dithers to the same pixels — only the object
 * underneath moves. three loads lazily after mount, so no page pays for the
 * library until a figure actually renders. At rest the figure floats and
 * rocks gently; drag it to orbit.
 * Reduced motion: one still frame renders at the default camera angle, idle
 * motion and drag-to-orbit are both off, and there is no render loop.
 */
export function DitherFigure({
  preset = "knot",
  src,
  scale = 1,
  pixelSize = 3,
  levels = 2,
  contrast = 0.6,
  pattern = "bayer",
  darkColor = "var(--ink)",
  lightColor = "var(--color-surface-0)",
  orbit = true,
  idle = true,
  className,
  children,
  height = 360,
}: DitherFigureProps) {
  const motionSafe = useMotionSafe();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    setReady(false);
    let disposed = false;
    let stage: FigureStage | null = null;
    let post: ReturnType<typeof createPostPass> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let raf = 0;
    let last: number | null = null;
    let inView = false;

    const still = !motionSafe;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!stage || !post) return;
      stage.step(dt);
      stage.render();
      post.render(stage.renderer);
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        last = null;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    void (async () => {
      const runtime = await loadFigureRuntime();
      if (disposed) return;

      const createdStage = await createFigureStage(canvas, runtime, {
        source: { preset, src, scale },
        orbit: orbit && !still,
        idle: idle && !still,
      });
      if (disposed) {
        createdStage.dispose();
        return;
      }
      stage = createdStage;

      const dark = resolveColor(darkColor, host);
      const light = resolveColor(lightColor, host);

      const rect = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, rect.width);
      const heightPx = Math.max(1, rect.height);
      stage.resize(width, heightPx, pixelRatio);

      const uniforms = {
        tScene: { value: stage.target.texture },
        uRes: {
          value: new runtime.THREE.Vector2(
            Math.max(1, Math.round(width * pixelRatio)),
            Math.max(1, Math.round(heightPx * pixelRatio)),
          ),
        },
        uPixelSize: { value: Math.max(pixelSize, 1) },
        uLevels: { value: levels },
        uContrast: { value: contrast },
        uPattern: { value: PATTERN_INDEX[pattern] },
        uDark: { value: new runtime.THREE.Color(dark[0], dark[1], dark[2]) },
        uLight: {
          value: new runtime.THREE.Color(light[0], light[1], light[2]),
        },
      };
      post = createPostPass(runtime, FRAGMENT, uniforms);

      const drawOnce = () => {
        if (!stage || !post) return;
        stage.step(0);
        stage.render();
        post.render(stage.renderer);
      };

      if (still) {
        drawOnce();
        setReady(true);
        return;
      }

      resizeObserver = new ResizeObserver(() => {
        const r = host.getBoundingClientRect();
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, r.width);
        const h = Math.max(1, r.height);
        stage?.resize(w, h, ratio);
        uniforms.uRes.value.set(
          Math.max(1, Math.round(w * ratio)),
          Math.max(1, Math.round(h * ratio)),
        );
      });
      resizeObserver.observe(host);

      intersectionObserver = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncLoop();
      });
      intersectionObserver.observe(host);
      document.addEventListener("visibilitychange", syncLoop);

      drawOnce();
      setReady(true);
    })();

    return () => {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", syncLoop);
      resizeObserver?.disconnect();
      post?.dispose();
      stage?.dispose();
    };
  }, [
    preset,
    src,
    scale,
    pixelSize,
    levels,
    contrast,
    pattern,
    darkColor,
    lightColor,
    orbit,
    idle,
    motionSafe,
  ]);

  return (
    <div
      ref={hostRef}
      data-figure-host
      data-figure-ready={ready ? "true" : undefined}
      className={cn("relative overflow-hidden rounded-4", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        data-effect-canvas="dither-figure"
        className="block h-full w-full"
      />
      {children && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 text-center">
          {children}
        </div>
      )}
    </div>
  );
}
