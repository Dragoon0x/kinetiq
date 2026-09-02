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

export type InkFigureProps = {
  /** Which built-in figure to show; ignored once `src` is set. @default "knot" */
  preset?: FigurePreset;
  /** A GLB/glTF, SVG, or raster image URL, sniffed from its bytes — overrides `preset`. */
  src?: string;
  /** Extra multiplier over the figure's normalised fit. @default 1 */
  scale?: number;
  /** Sobel sampling offset for the silhouette/crease lines, in device pixels — thicker line at a higher value. @default 1.5 */
  lineWeight?: number;
  /** Density multiplier for the shading hatch. @default 1 */
  hatch?: number;
  /** Ink colour, resolved through the real cascade so tokens work. CSS. @default "var(--ink)" */
  color?: string;
  /** Page colour painted across the whole canvas behind the ink. CSS. @default "var(--color-surface-0)" */
  paper?: string;
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

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uLineWeight;
uniform float uHatch;
uniform float uNear;
uniform float uFar;
uniform vec3 uColor;
uniform vec4 uPaper;
in vec2 vUv;
out vec4 outColor;

float kx_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float kx_hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
}

// NDC depth -> positive linear distance from the camera, so a silhouette
// (object depth against the cleared-to-far background) reads as one big
// step no matter how the figure is oriented.
float kx_linearDepth(vec2 uv) {
  float z = texture(tDepth, uv).x;
  float viewZ = (uNear * uFar) / ((uFar - uNear) * z - uFar);
  return -viewZ;
}

float kx_depthEdge(vec2 uv, vec2 texel) {
  float d00 = kx_linearDepth(uv + vec2(-texel.x, -texel.y));
  float d10 = kx_linearDepth(uv + vec2(0.0, -texel.y));
  float d20 = kx_linearDepth(uv + vec2(texel.x, -texel.y));
  float d01 = kx_linearDepth(uv + vec2(-texel.x, 0.0));
  float d21 = kx_linearDepth(uv + vec2(texel.x, 0.0));
  float d02 = kx_linearDepth(uv + vec2(-texel.x, texel.y));
  float d12 = kx_linearDepth(uv + vec2(0.0, texel.y));
  float d22 = kx_linearDepth(uv + vec2(texel.x, texel.y));
  float gx = -d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22;
  float gy = -d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22;
  return length(vec2(gx, gy));
}

float kx_normalEdge(vec2 uv, vec2 texel) {
  vec3 n00 = texture(tNormal, uv + vec2(-texel.x, -texel.y)).rgb;
  vec3 n10 = texture(tNormal, uv + vec2(0.0, -texel.y)).rgb;
  vec3 n20 = texture(tNormal, uv + vec2(texel.x, -texel.y)).rgb;
  vec3 n01 = texture(tNormal, uv + vec2(-texel.x, 0.0)).rgb;
  vec3 n21 = texture(tNormal, uv + vec2(texel.x, 0.0)).rgb;
  vec3 n02 = texture(tNormal, uv + vec2(-texel.x, texel.y)).rgb;
  vec3 n12 = texture(tNormal, uv + vec2(0.0, texel.y)).rgb;
  vec3 n22 = texture(tNormal, uv + vec2(texel.x, texel.y)).rgb;
  vec3 gx = -n00 - 2.0 * n01 - n02 + n20 + 2.0 * n21 + n22;
  vec3 gy = -n00 - 2.0 * n10 - n20 + n02 + 2.0 * n12 + n22;
  return length(gx) + length(gy);
}

// Two diagonal line grids, spaced by density; the darkest shade tier shows
// both (a cross-hatch), the midtone tier only the first.
float kx_hatch(vec2 px, float shade, float density) {
  float period = max(20.0 / max(density, 0.05), 3.0);
  float a = mod(px.x + px.y, period);
  float b = mod(px.x - px.y, period);
  float lineA = 1.0 - smoothstep(0.0, 1.25, a);
  float lineB = 1.0 - smoothstep(0.0, 1.25, b);
  float mid = smoothstep(0.3, 0.55, shade);
  float dark = smoothstep(0.58, 0.85, shade);
  float single = lineA * mid;
  float crossed = max(lineA, lineB) * dark;
  return clamp(max(single, crossed), 0.0, 1.0);
}

void main() {
  vec2 px = vUv * uRes;
  vec4 scene = texture(tScene, vUv);
  vec2 texel = max(uLineWeight, 0.1) / uRes;

  float lineDepth = smoothstep(0.25, 1.1, kx_depthEdge(vUv, texel));
  float lineNormal = smoothstep(0.35, 1.0, kx_normalEdge(vUv, texel));
  float line = clamp(max(lineDepth, lineNormal), 0.0, 1.0);

  float shade = clamp(1.0 - kx_luma(scene.rgb), 0.0, 1.0);
  float hatchMask = kx_hatch(px, shade, uHatch) * scene.a;

  float coverage = clamp(max(line, hatchMask), 0.0, 1.0);
  vec3 inked = mix(uPaper.rgb, uColor, coverage);

  float grain = (kx_hash(px) - 0.5) * 0.05;
  inked += grain * (1.0 - coverage);

  outColor = vec4(clamp(inked, 0.0, 1.0), uPaper.a);
}
`;

/** Pixel size a `WebGLRenderTarget` should carry for a given CSS size and (already-capped) device pixel ratio — matches how `figure.ts` sizes its own target, so the extra normal/depth target always lines up with the stage's. */
function pixelSize(
  width: number,
  height: number,
  ratio: number,
): [number, number] {
  return [
    Math.max(1, Math.round(width * ratio)),
    Math.max(1, Math.round(height * ratio)),
  ];
}

/**
 * A three.js figure drawn as ink on paper: a torus knot by default, with
 * silhouette and crease lines pulled from a second render's depth and normal
 * buffers, and diagonal hatching that thickens as the lit shading darkens.
 * Because the lines come from depth and normal discontinuities rather than a
 * fixed outline pass, they hold at any angle the figure is dragged to. three
 * loads lazily after mount, so no page pays for the library until a figure
 * actually renders. At rest the figure floats and rocks gently; drag it to
 * orbit.
 * Reduced motion: one still frame renders at the default camera angle, idle
 * motion and drag-to-orbit are both off, and there is no render loop.
 */
export function InkFigure({
  preset = "knot",
  src,
  scale = 1,
  lineWeight = 1.5,
  hatch = 1,
  color = "var(--ink)",
  paper = "var(--color-surface-0)",
  orbit = true,
  idle = true,
  className,
  children,
  height = 360,
}: InkFigureProps) {
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
    let tNormal: THREE.WebGLRenderTarget | null = null;
    let normalMaterial: THREE.MeshNormalMaterial | null = null;
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
      if (!stage || !post || !tNormal || !normalMaterial) return;
      stage.step(dt);
      stage.render();
      stage.scene.overrideMaterial = normalMaterial;
      stage.renderer.setRenderTarget(tNormal);
      stage.renderer.render(stage.scene, stage.camera);
      stage.scene.overrideMaterial = null;
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

      const depthTexture = new runtime.THREE.DepthTexture(1, 1);
      const normalTarget = new runtime.THREE.WebGLRenderTarget(1, 1, {
        format: runtime.THREE.RGBAFormat,
        minFilter: runtime.THREE.NearestFilter,
        magFilter: runtime.THREE.NearestFilter,
      });
      normalTarget.depthTexture = depthTexture;
      tNormal = normalTarget;
      normalMaterial = new runtime.THREE.MeshNormalMaterial();

      const ink = resolveColor(color, host);
      const paperColor = resolveColor(paper, host);

      const rect = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, rect.width);
      const heightPx = Math.max(1, rect.height);
      stage.resize(width, heightPx, pixelRatio);
      const [pxWidth, pxHeight] = pixelSize(width, heightPx, pixelRatio);
      normalTarget.setSize(pxWidth, pxHeight);

      const uniforms = {
        tScene: { value: stage.target.texture },
        tNormal: { value: normalTarget.texture },
        tDepth: { value: depthTexture },
        uRes: { value: new runtime.THREE.Vector2(pxWidth, pxHeight) },
        uLineWeight: { value: Math.max(lineWeight, 0.1) },
        uHatch: { value: Math.max(hatch, 0) },
        uNear: { value: stage.camera.near },
        uFar: { value: stage.camera.far },
        uColor: { value: new runtime.THREE.Color(ink[0], ink[1], ink[2]) },
        uPaper: {
          value: new runtime.THREE.Vector4(
            paperColor[0],
            paperColor[1],
            paperColor[2],
            paperColor[3],
          ),
        },
      };
      post = createPostPass(runtime, FRAGMENT, uniforms);

      const drawOnce = () => {
        if (!stage || !post || !tNormal || !normalMaterial) return;
        stage.step(0);
        stage.render();
        stage.scene.overrideMaterial = normalMaterial;
        stage.renderer.setRenderTarget(tNormal);
        stage.renderer.render(stage.scene, stage.camera);
        stage.scene.overrideMaterial = null;
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
        const [pw, ph] = pixelSize(w, h, ratio);
        tNormal?.setSize(pw, ph);
        uniforms.uRes.value.set(pw, ph);
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
      tNormal?.dispose();
      normalMaterial?.dispose();
      stage?.dispose();
    };
  }, [
    preset,
    src,
    scale,
    lineWeight,
    hatch,
    color,
    paper,
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
        data-effect-canvas="ink-figure"
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
