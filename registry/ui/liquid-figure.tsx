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
import { cn } from "@/registry/lib/utils";

export type LiquidFigureProps = {
  /** Which built-in figure to show; ignored once `src` is set. @default "knot" */
  preset?: FigurePreset;
  /** A GLB/glTF, SVG, or raster image URL, sniffed from its bytes — overrides `preset`. */
  src?: string;
  /** Extra multiplier over the figure's normalised fit. @default 1 */
  scale?: number;
  /** Flow-field displacement multiplier. @default 1 */
  strength?: number;
  /** Flow-field animation rate. @default 1 */
  speed?: number;
  /** Pointer-stirred ripple strength. @default 1 */
  stir?: number;
  /** Specular sheen intensity riding the ripples. @default 0.6 */
  sheen?: number;
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

const MAX_STIR_POINTS = 8;

// (n - 0.5) from a 5-octave fbm has an RMS around 0.15-0.2, so this base
// lands the flow field's typical displacement near the "~0.02 uv at
// strength 1" the field is tuned for.
const FLOW_BASE = 0.12;
// A stir ring's peak (sin = 1, no decay) should read as a stronger, more
// immediate push than the ambient flow — this is the base at stir = 1.
const STIR_BASE = 0.05;

type StirPoint = { u: number; v: number; time: number };

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform float uTime;
uniform float uSpeed;
uniform float uStrength;
uniform vec3 uStir[8];
uniform float uStirStrength;
uniform float uSheen;
uniform float uGlintAlpha;
uniform float uAspect;
in vec2 vUv;
out vec4 outColor;

float kx_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float kx_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(kx_hash(i), kx_hash(i + vec2(1.0, 0.0)), u.x),
             mix(kx_hash(i + vec2(0.0, 1.0)), kx_hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float kx_fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i += 1) { sum += amp * kx_noise(p); p *= 2.02; amp *= 0.5; }
  return sum;
}

// One stir point's ring value at uv: an outward sine wave that ages out
// with exp(-age) and fades spatially with exp(-dist*6) so it never rings the
// whole canvas — aspect-corrected so the ring reads circular, not elliptical.
float kx_ring(vec3 stir, vec2 uv) {
  vec2 d = uv - stir.xy;
  d.x *= uAspect;
  float dist = length(d);
  float age = stir.z;
  float falloff = exp(-dist * 6.0);
  return uStirStrength * sin(dist * 40.0 - age * 6.0) * exp(-age) * falloff;
}

// Sum of every stir ring's contribution to the scalar liquid height at
// uv — shared by the displacement (as a directional push, below) and the
// sheen normal (via finite differences) so the two always agree about
// where the surface is disturbed.
float kx_stirHeight(vec2 uv) {
  float h = 0.0;
  for (int i = 0; i < 8; i += 1) h += kx_ring(uStir[i], uv);
  return h;
}

vec2 kx_stirDisplacement(vec2 uv) {
  vec2 total = vec2(0.0);
  for (int i = 0; i < 8; i += 1) {
    vec3 stir = uStir[i];
    vec2 d = uv - stir.xy;
    d.x *= uAspect;
    float dist = length(d);
    vec2 dir = dist > 0.0001 ? normalize(d) : vec2(0.0);
    total += dir * kx_ring(stir, uv);
  }
  return total;
}

// Scalar liquid height at uv, time: the flow field's own tap plus every
// stir ring, independent of the displaced lookup below so it stays a clean
// function of position — safe to finite-difference for the sheen normal.
float kx_height(vec2 uv, float time) {
  float flow = kx_fbm(uv * 3.0 + time * uSpeed * 0.2) - 0.5;
  return flow * uStrength + kx_stirHeight(uv);
}

void main() {
  vec2 uv = vUv;

  // Flow field: two decorrelated taps of the same fbm (the second offset
  // into an uncorrelated patch of the noise) give the x/y components of a
  // 2D displacement instead of a single scalar push.
  float nx = kx_fbm(uv * 3.0 + uTime * uSpeed * 0.2);
  float ny = kx_fbm(uv * 3.0 + uTime * uSpeed * 0.2 + vec2(19.7, 5.3));
  vec2 n = vec2(nx, ny);
  vec2 disp = (n - 0.5) * uStrength + kx_stirDisplacement(uv);

  vec4 scene = texture(tScene, uv + disp);

  // Sheen: a normal built from finite differences of the same height field
  // that drives the displacement, lit from the same direction as the
  // stage's own key light, so the highlight sits on the ripple crest.
  float e = 0.0025;
  float hL = kx_height(uv - vec2(e, 0.0), uTime);
  float hR = kx_height(uv + vec2(e, 0.0), uTime);
  float hD = kx_height(uv - vec2(0.0, e), uTime);
  float hU = kx_height(uv + vec2(0.0, e), uTime);
  vec3 normal = normalize(vec3((hL - hR) / (2.0 * e), (hD - hU) / (2.0 * e), 1.0));
  vec3 light = normalize(vec3(-3.2, 4.0, 5.0));
  float spec = pow(max(dot(normal, light), 0.0), 24.0) * uSheen;

  vec3 color = scene.rgb;
  float alpha = scene.a;
  if (scene.a > 0.05) {
    color += vec3(spec);
  } else {
    // A water-surface glint over an otherwise-transparent background —
    // only visible once uGlintAlpha is raised above its default 0, which
    // keeps the outside fully transparent today.
    color = vec3(spec);
    alpha = spec * uGlintAlpha;
  }

  outColor = vec4(color, alpha);
}
`;

/**
 * A three.js figure seen through a sheet of liquid: the lit render is
 * sampled through a procedural flow field — two decorrelated fbm taps
 * warping the lookup uv — so the object ripples and swims behind the
 * surface. Move the pointer over the host and the last eight touches ring
 * outward as their own decaying waves, each lit by a specular sheen that
 * follows the displacement field's own gradient. The field is computed
 * fresh from uv and time every frame — nothing about it is stored between
 * frames — and three loads lazily after mount, so no page pays for the
 * library until a liquid figure actually renders. At rest the figure
 * floats and rocks gently; drag it to orbit.
 * Reduced motion: one still frame renders at the default camera angle with
 * the flow frozen at time zero and no stir, idle motion and drag-to-orbit
 * are both off, and there is no render loop.
 */
export function LiquidFigure({
  preset = "knot",
  src,
  scale = 1,
  strength = 1,
  speed = 1,
  stir = 1,
  sheen = 0.6,
  orbit = true,
  idle = true,
  className,
  children,
  height = 360,
}: LiquidFigureProps) {
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
    let uniforms: Record<string, THREE.IUniform> | null = null;
    let stirVectors: THREE.Vector3[] = [];
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let raf = 0;
    let last: number | null = null;
    let inView = false;
    let clock = 0;
    let cleanupPointer: (() => void) | null = null;
    const stirPoints: StirPoint[] = [];

    const still = !motionSafe;

    const updateStirUniforms = (now: number) => {
      for (let i = 0; i < MAX_STIR_POINTS; i += 1) {
        const vector = stirVectors[i];
        if (!vector) continue;
        const point = stirPoints[i];
        if (point) {
          const age = Math.max(0, (now - point.time) / 1000);
          vector.set(point.u, point.v, age);
        } else {
          // Off-canvas and far enough into "aged out" that exp(-age) is
          // zero, so an empty slot never rings.
          vector.set(-10, -10, 999);
        }
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.1);
      last = now;
      clock += dt;
      if (!stage || !post || !uniforms) return;
      updateStirUniforms(now);
      const timeUniform = uniforms.uTime;
      if (timeUniform) timeUniform.value = clock;
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

      const rect = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, rect.width);
      const heightPx = Math.max(1, rect.height);
      stage.resize(width, heightPx, pixelRatio);

      stirVectors = Array.from(
        { length: MAX_STIR_POINTS },
        () => new runtime.THREE.Vector3(-10, -10, 999),
      );

      const builtUniforms = {
        tScene: { value: stage.target.texture },
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uStrength: { value: strength * FLOW_BASE },
        uStir: { value: stirVectors },
        uStirStrength: { value: stir * STIR_BASE },
        uSheen: { value: sheen },
        // Reserved for a future water-surface glint over transparent
        // backgrounds; kept at 0 so the outside stays fully transparent.
        uGlintAlpha: { value: 0 },
        uAspect: { value: width / heightPx },
      };
      uniforms = builtUniforms;
      post = createPostPass(runtime, FRAGMENT, builtUniforms);

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
        builtUniforms.uAspect.value = w / h;
      });
      resizeObserver.observe(host);

      intersectionObserver = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncLoop();
      });
      intersectionObserver.observe(host);
      document.addEventListener("visibilitychange", syncLoop);

      const onPointerMove = (event: PointerEvent) => {
        const r = host.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const u = (event.clientX - r.left) / r.width;
        const v = 1 - (event.clientY - r.top) / r.height;
        stirPoints.push({ u, v, time: event.timeStamp });
        if (stirPoints.length > MAX_STIR_POINTS) stirPoints.shift();
      };
      host.addEventListener("pointermove", onPointerMove);
      cleanupPointer = () =>
        host.removeEventListener("pointermove", onPointerMove);

      drawOnce();
      setReady(true);
    })();

    return () => {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", syncLoop);
      resizeObserver?.disconnect();
      cleanupPointer?.();
      post?.dispose();
      stage?.dispose();
    };
  }, [
    preset,
    src,
    scale,
    strength,
    speed,
    stir,
    sheen,
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
        data-effect-canvas="liquid-figure"
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
