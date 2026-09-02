"use client";

import * as React from "react";

import type * as THREE from "three";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFigureStage,
  loadFigureRuntime,
  type FigurePreset,
  type FigureStage,
} from "@/registry/lib/figure";
import { resolveColor } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";

export type GlassFigureProps = {
  /** Which built-in figure to show; ignored once `src` is set. @default "knot" */
  preset?: FigurePreset;
  /** A GLB/glTF, SVG, or raster image URL, sniffed from its bytes — overrides `preset`. */
  src?: string;
  /** Extra multiplier over the figure's normalised fit. @default 1 */
  scale?: number;
  /** Index of refraction fed to the physical material. @default 1.5 */
  ior?: number;
  /** Chromatic spread the glass introduces at grazing angles. @default 0.08 */
  dispersion?: number;
  /** Material thickness the transmission pass refracts through. @default 1.2 */
  thickness?: number;
  /** Glass tint, resolved through the real cascade so tokens work. CSS. @default "var(--color-surface-0)" */
  tint?: string;
  /** Draw a gridded, lettered backdrop behind the figure for the glass to bend. @default true */
  backdrop?: boolean;
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

const BACKDROP_INK = "var(--color-ink)";
const BACKDROP_CANVAS_WIDTH = 1024;
const BACKDROP_CANVAS_HEIGHT = 640;
const BACKDROP_PLANE_WIDTH = 20;
const BACKDROP_PLANE_HEIGHT = 12.5;
const BACKDROP_Z = -2.5;

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
 * Paints the studio backdrop the glass refracts: the host's own rendered
 * background as the ground, a thin grid over it, and a few oversized mono
 * words (REFRACT, the index of refraction, the preset name) in the ink
 * colour at low opacity — enough structure that bending it through the
 * figure actually reads as refraction rather than a blur.
 */
function paintBackdrop(
  host: HTMLElement,
  presetLabel: string,
  ior: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = BACKDROP_CANVAS_WIDTH;
  canvas.height = BACKDROP_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const groundCss = getComputedStyle(host).backgroundColor;
  ctx.fillStyle =
    groundCss && groundCss !== "rgba(0, 0, 0, 0)" ? groundCss : "#1c1d22";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ink = resolveColor(BACKDROP_INK, host);
  const inkRgb = `${Math.round(ink[0] * 255)}, ${Math.round(ink[1] * 255)}, ${Math.round(ink[2] * 255)}`;

  ctx.strokeStyle = `rgba(${inkRgb}, 0.08)`;
  ctx.lineWidth = 1;
  const step = 64;
  for (let x = 0; x <= canvas.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvas.width, y + 0.5);
    ctx.stroke();
  }

  const fontFamily = resolveFontFamily(host);
  ctx.fillStyle = `rgba(${inkRgb}, 0.16)`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 88px ${fontFamily}`;
  ctx.fillText("REFRACT", canvas.width / 2, canvas.height * 0.28);
  ctx.font = `600 64px ${fontFamily}`;
  ctx.fillText(`IOR ${ior.toFixed(2)}`, canvas.width / 2, canvas.height * 0.54);
  ctx.fillText(
    presetLabel.toUpperCase(),
    canvas.width / 2,
    canvas.height * 0.78,
  );

  return canvas;
}

/**
 * A three.js figure — a torus knot by default — rendered in physically
 * modelled glass: `MeshPhysicalMaterial`'s transmission, refraction, and
 * dispersion bend whatever sits behind it, so a backdrop carrying a gridded
 * canvas texture and a few oversized words sits behind the figure to make
 * that bending legible. There's no post pass here — the scene renders
 * straight to the screen so the browser's own transmission sampling can see
 * past the figure to the backdrop. three loads lazily after mount, so no
 * page pays for the library until a figure actually renders. At rest the
 * figure floats and rocks gently; drag it to orbit.
 * Reduced motion: one still frame renders at the default camera angle, idle
 * motion and drag-to-orbit are both off, and there is no render loop.
 */
export function GlassFigure({
  preset = "knot",
  src,
  scale = 1,
  ior = 1.5,
  dispersion = 0.08,
  thickness = 1.2,
  tint = "var(--color-surface-0)",
  backdrop = true,
  orbit = true,
  idle = true,
  className,
  children,
  height = 360,
}: GlassFigureProps) {
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
    let backdropTexture: THREE.CanvasTexture | null = null;
    let backdropGeometry: THREE.PlaneGeometry | null = null;
    let backdropMaterial: THREE.MeshBasicMaterial | null = null;
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
      if (!stage) return;
      stage.step(dt);
      stage.renderer.setRenderTarget(null);
      stage.renderer.render(stage.scene, stage.camera);
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

      // No PMREMGenerator environment map — the studio lights already on the
      // stage do the lighting, this just keeps three from expecting one.
      stage.scene.environment = null;

      const tintColor = resolveColor(tint, host);
      const glassColor = new runtime.THREE.Color(
        tintColor[0],
        tintColor[1],
        tintColor[2],
      );

      stage.object.traverse((child) => {
        if (!(child instanceof runtime.THREE.Mesh)) return;
        const previous = child.material;
        const previousList = Array.isArray(previous) ? previous : [previous];
        for (const material of previousList) {
          const map = (
            material as THREE.Material & { map?: THREE.Texture | null }
          ).map;
          map?.dispose();
          material.dispose();
        }
        child.material = new runtime.THREE.MeshPhysicalMaterial({
          transmission: 1,
          thickness,
          ior,
          dispersion,
          roughness: 0.08,
          metalness: 0,
          color: glassColor,
          envMapIntensity: 1,
          specularIntensity: 1,
          side: runtime.THREE.FrontSide,
        });
      });

      if (backdrop) {
        const painted = paintBackdrop(host, preset, ior);
        const texture = new runtime.THREE.CanvasTexture(painted);
        texture.colorSpace = runtime.THREE.SRGBColorSpace;
        backdropTexture = texture;
        backdropGeometry = new runtime.THREE.PlaneGeometry(
          BACKDROP_PLANE_WIDTH,
          BACKDROP_PLANE_HEIGHT,
        );
        backdropMaterial = new runtime.THREE.MeshBasicMaterial({
          map: texture,
        });
        const backdropMesh = new runtime.THREE.Mesh(
          backdropGeometry,
          backdropMaterial,
        );
        backdropMesh.position.z = BACKDROP_Z;
        stage.scene.add(backdropMesh);
      }

      const rect = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, rect.width);
      const heightPx = Math.max(1, rect.height);
      stage.resize(width, heightPx, pixelRatio);

      const drawOnce = () => {
        if (!stage) return;
        stage.step(0);
        stage.renderer.setRenderTarget(null);
        stage.renderer.render(stage.scene, stage.camera);
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
      backdropGeometry?.dispose();
      backdropMaterial?.dispose();
      backdropTexture?.dispose();
      stage?.dispose();
    };
  }, [
    preset,
    src,
    scale,
    ior,
    dispersion,
    thickness,
    tint,
    backdrop,
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
        data-effect-canvas="glass-figure"
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
