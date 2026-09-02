"use client";

import * as React from "react";

import type * as THREE from "three";

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

export type AsciiFigureProps = {
  /** Which built-in figure to show; ignored once `src` is set. @default "knot" */
  preset?: FigurePreset;
  /** A GLB/glTF, SVG, or raster image URL, sniffed from its bytes — overrides `preset`. */
  src?: string;
  /** Extra multiplier over the figure's normalised fit. @default 1 */
  scale?: number;
  /** Screen-space size of one glyph cell, in CSS pixels. @default 9 */
  cell?: number;
  /** Ramp from sparsest to densest glyph. @default " .:-=+*#%@" */
  charset?: string;
  /** Ink colour, resolved through the real cascade so tokens work. CSS. @default "var(--ink)" */
  color?: string;
  /** Canvas fill; default leaves it transparent so the host's own background shows through. */
  background?: string;
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

// The atlas's own raster resolution — device px per glyph cell in the strip
// texture, independent of `cell`, which sizes the on-screen sampling grid.
const ATLAS_CELL = 16;
const MAX_GLYPHS = 32;
const DEFAULT_CHARSET = " .:-=+*#%@";

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tAtlas;
uniform vec2 uRes;
uniform float uCell;
uniform float uGlyphCount;
uniform vec3 uColor;
uniform vec4 uBg;
in vec2 vUv;
out vec4 outColor;

float kx_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 px = vUv * uRes;
  float cell = max(uCell, 1.0);
  vec2 cellCenter = (floor(px / cell) + 0.5) * cell;
  vec4 scene = texture(tScene, cellCenter / uRes);

  if (scene.a < 0.05) {
    outColor = vec4(0.0);
    return;
  }

  // Composite over the figure's own background before reading luminance —
  // an edge texel's own colour is unreliable once its alpha drops, so this
  // keeps a soft edge from reading as darker (or lighter) than it looks.
  vec3 composited = mix(uBg.rgb, scene.rgb, scene.a);
  float lum = kx_luma(composited);

  // The ramp always runs sparse-to-dense; which end of the luminance range
  // is "dense" flips with the ink itself — dark ink (a light theme) piles
  // glyphs onto dark pixels, light ink (a dark theme) piles them onto
  // bright ones — so the figure reads as ink on its surroundings either way.
  float inkLuma = kx_luma(uColor);
  float coverage = inkLuma < 0.5 ? (1.0 - lum) : lum;

  float count = max(uGlyphCount, 1.0);
  float index = min(floor(coverage * count), count - 1.0);

  vec2 localUv = fract(px / cell);
  vec2 atlasUv = vec2((index + localUv.x) / count, localUv.y);
  vec4 glyph = texture(tAtlas, atlasUv);

  outColor = vec4(uColor, glyph.a * scene.a);
}
`;

/** Rasterises `charset` into a single-row strip, one ATLAS_CELL-square cell per glyph, white ink on a transparent field so the shader reads shape from alpha alone. */
function buildGlyphAtlas(
  charset: string,
  fontFamily: string,
): { canvas: HTMLCanvasElement; count: number } {
  const chars = [...charset].slice(0, MAX_GLYPHS);
  const list = chars.length > 0 ? chars : [" "];
  const canvas = document.createElement("canvas");
  canvas.width = list.length * ATLAS_CELL;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, count: list.length };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(ATLAS_CELL * 0.85)}px ${fontFamily}`;
  list.forEach((char, index) => {
    if (char === " ") return;
    ctx.fillText(char, index * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2);
  });
  return { canvas, count: list.length };
}

/** Resolves `var(--font-mono)` through the real cascade — a bare custom-property read hands back unexpanded token text, and canvas's `font` setter can't parse that. */
function resolveFontFamily(host: HTMLElement): string {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.fontFamily = "var(--font-mono)";
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).fontFamily;
  probe.remove();
  return resolved || "monospace";
}

/**
 * A three.js figure — a torus knot by default — rendered as a field of ASCII
 * glyphs: the lit render is converted to a grid of cells, each cell's
 * luminance picks a glyph from a rasterised charset, and the glyph is drawn
 * back in `color`. three loads lazily after mount, so no page pays for the
 * library until a figure actually renders. At rest the figure floats and
 * rocks gently; drag it to orbit. Empty space around the figure stays fully
 * transparent, so the host's own background shows through unless
 * `background` is set.
 * Reduced motion: one still frame renders at the default camera angle, idle
 * motion and drag-to-orbit are both off, and there is no render loop.
 */
export function AsciiFigure({
  preset = "knot",
  src,
  scale = 1,
  cell = 9,
  charset = DEFAULT_CHARSET,
  color = "var(--ink)",
  background,
  orbit = true,
  idle = true,
  className,
  children,
  height = 360,
}: AsciiFigureProps) {
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
    let atlasTexture: THREE.CanvasTexture | null = null;
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

      const fontFamily = resolveFontFamily(host);
      const atlas = buildGlyphAtlas(charset, fontFamily);
      const texture = new runtime.THREE.CanvasTexture(atlas.canvas);
      texture.minFilter = runtime.THREE.NearestFilter;
      texture.magFilter = runtime.THREE.NearestFilter;
      texture.generateMipmaps = false;
      atlasTexture = texture;

      const ink = resolveColor(color, host);
      const bg: [number, number, number, number] = background
        ? resolveColor(background, host)
        : [0, 0, 0, 0];

      const rect = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, rect.width);
      const heightPx = Math.max(1, rect.height);
      stage.resize(width, heightPx, pixelRatio);

      const uniforms = {
        tScene: { value: stage.target.texture },
        tAtlas: { value: texture },
        uRes: {
          value: new runtime.THREE.Vector2(
            Math.max(1, Math.round(width * pixelRatio)),
            Math.max(1, Math.round(heightPx * pixelRatio)),
          ),
        },
        uCell: { value: Math.max(cell, 1) * pixelRatio },
        uGlyphCount: { value: atlas.count },
        uColor: { value: new runtime.THREE.Color(ink[0], ink[1], ink[2]) },
        uBg: { value: new runtime.THREE.Vector4(bg[0], bg[1], bg[2], bg[3]) },
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
        uniforms.uCell.value = Math.max(cell, 1) * ratio;
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
      atlasTexture?.dispose();
      stage?.dispose();
    };
  }, [
    preset,
    src,
    scale,
    cell,
    charset,
    color,
    background,
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
      style={{ height, backgroundColor: background }}
    >
      <canvas
        ref={canvasRef}
        data-effect-canvas="ascii-figure"
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
