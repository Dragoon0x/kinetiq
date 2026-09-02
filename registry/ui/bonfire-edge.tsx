"use client";

import * as React from "react";

import { animate, useMotionValue, useVelocity } from "motion/react";

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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type BonfireEdgeProps = {
  /** Band height in CSS pixels, measured in from `edge`. @default 140 */
  height?: number;
  /** Overall flame scale — pushes more of the noise field past the colour thresholds. @default 1 */
  intensity?: number;
  /** Playback rate for the rise of the flame field and the sparks' climb. @default 1 */
  speed?: number;
  /** Flame colour; the ramp mixes toward yellow, then white, above it. @default "var(--warn)" */
  color?: string;
  /** Spark visibility and brightness multiplier; 0 turns them off. @default 1 */
  sparks?: number;
  /** Heat-shimmer strength in the band above the flames; 0 turns it off. @default 1 */
  shimmer?: number;
  /** How far the flames lean per unit of smoothed pointer velocity. @default 0.5 */
  wind?: number;
  /** Multiplies the ~200px pointer-proximity reach that grows flame height near the cursor. @default 1 */
  heat?: number;
  /** Which side of the host the fire burns along. @default "bottom" */
  edge?: "bottom" | "top";
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// `heat` and `wind` are unitless multipliers (like `sparks`/`shimmer`) over
// these base constants, not raw pixel/velocity values themselves.
const HEAT_RADIUS_BASE = 200;
const WIND_SCALE = 0.03;
const WIND_CLAMP = 60;
const SPARK_SLOTS = 48;

// Sentinel pointer position, far enough outside any canvas that the heat
// and wind terms both read as "no pointer" — the same convention dust-reveal
// uses for its own offscreen cursor.
const OFFSCREEN = -9999;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_time;
uniform float u_speed;
uniform float u_height;
uniform float u_intensity;
uniform vec3 u_color;
uniform float u_sparks;
uniform float u_shimmer;
uniform float u_windShift;
uniform float u_heat;
uniform float u_pointerX;
uniform int u_edgeTop;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 s = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, s.rgb, s.a);
}

void main() {
  vec2 px = v_uv * u_res;
  float edgeDist = u_edgeTop == 1 ? px.y : (u_res.y - px.y);
  float H = max(u_height, 1.0);

  // Past the outermost band (shimmer reaches 1.8H, sparks travel up to
  // 1.9H) there is nothing to draw — bail to a fully transparent pixel.
  if (edgeDist < -2.0 || edgeDist > H * 2.05) {
    o_color = vec4(0.0);
    return;
  }

  float t = u_time * u_speed;

  // Heat: pointer proximity along the edge stretches the local flame
  // height, up to 1.6x, within u_heat pixels of the pointer's x.
  float distToPointer = abs(px.x - u_pointerX);
  float heatFactor = u_pointerX > -5000.0
    ? 1.0 - smoothstep(0.0, max(u_heat, 1.0), distToPointer)
    : 0.0;
  float localHeight = H * mix(1.0, 1.6, heatFactor);

  // Falloff from the edge: 1 at the edge itself, 0 by ~1.15x the local
  // (heat-stretched) height.
  float g = 1.0 - smoothstep(0.0, localHeight * 1.15, edgeDist);

  // Wind leans the flame more at the tip than at the root — shift the
  // noise sample horizontally, scaled by how far up the band this pixel
  // sits.
  float lean = u_windShift * clamp(edgeDist / max(localHeight, 1.0), 0.0, 1.6);
  vec2 noiseP = vec2((px.x + lean) * 0.01, edgeDist * 0.02 - t * 1.4);
  float f = kx_fbm(noiseP) * g;
  float fv = f * u_intensity;

  // Threshold into colour: transparent, then a deep tone, then bright
  // mixed toward yellow, then a white-hot core close to the edge.
  float body = smoothstep(0.12, 0.34, fv);
  float bright = smoothstep(0.34, 0.62, fv);
  float core = smoothstep(0.62, 0.88, fv)
    * (1.0 - smoothstep(0.0, localHeight * 0.55, edgeDist));
  // Fire is not one colour: an ember red at the base, the token's warmth
  // through the body, orange into yellow toward the tips, and a pale core.
  vec3 ember = vec3(0.62, 0.10, 0.02);
  vec3 deep = mix(ember, u_color * 0.7, 0.3);
  vec3 orange = vec3(1.0, 0.46, 0.08);
  vec3 hot = mix(orange, mix(u_color, vec3(1.0, 0.84, 0.3), 0.5), 0.45);
  vec3 flameColor = mix(deep, hot, bright);
  flameColor = mix(flameColor, vec3(1.0, 0.96, 0.82), core);
  float flameAlpha = body;

  // Sparks: forty-eight seeded column slots run the width of the band;
  // only the slot nearest this pixel and its two neighbours can ever
  // reach it, so the loop only ever checks three.
  vec3 sparkColorSum = vec3(0.0);
  float sparkAlphaSum = 0.0;
  if (u_sparks > 0.001) {
    float slotWidth = u_res.x / ${SPARK_SLOTS}.0;
    int baseSlot = int(floor(px.x / slotWidth));
    for (int k = -1; k <= 1; k += 1) {
      float sf = float(baseSlot + k);
      float birth = kx_hash(vec2(sf, 3.3));
      float life = mix(1.4, 2.8, kx_hash(vec2(sf, 7.9)));
      float age = mod(t + birth * life, life) / life;
      float travel = H * 1.9;
      float sparkEdgeDist = age * travel;
      float jitter = (kx_noise(vec2(sf * 3.1 + age * 4.0, t * 0.5)) - 0.5) * 18.0;
      float baseX = (sf + 0.5) * slotWidth
        + (kx_hash(vec2(sf, 5.5)) - 0.5) * slotWidth * 0.5;
      float sparkX = baseX + jitter * age;
      float dotSize = mix(1.5, 2.5, kx_hash(vec2(sf, 9.1)));
      float d = length(vec2(px.x - sparkX, edgeDist - sparkEdgeDist));
      float fade = (1.0 - age) * smoothstep(0.0, 0.06, age);
      float spot = smoothstep(dotSize, 0.0, d);
      float glow = smoothstep(dotSize * 6.0, 0.0, d) * 0.45;
      float amt = (spot + glow) * fade * u_sparks;
      sparkColorSum += mix(u_color, vec3(1.0, 0.95, 0.75), 0.7) * amt;
      sparkAlphaSum += amt;
    }
  }
  float sparkAlpha = clamp(sparkAlphaSum, 0.0, 1.0);
  vec3 sparkColor = sparkAlphaSum > 0.0001
    ? sparkColorSum / sparkAlphaSum
    : vec3(0.0);

  // Shimmer: a band just above the flames re-samples the painted texture
  // through a noise offset, strongest right where the hot air rises off
  // the fire and fading out higher up. Off entirely under reduced motion.
  vec3 shimmerColor = vec3(0.0);
  float shimmerAlpha = 0.0;
  if (u_still < 0.5 && u_shimmer > 0.001) {
    float band = (1.0 - smoothstep(H * 0.9, H * 1.8, edgeDist))
      * smoothstep(H * 0.75, H * 0.9, edgeDist);
    if (band > 0.001) {
      vec2 n = vec2(
        kx_noise(v_uv * 30.0 + vec2(0.0, -t * 0.8)),
        kx_noise(v_uv * 30.0 + vec2(11.3, -t * 0.8))
      ) * 2.0 - 1.0;
      vec2 shimmerUv = v_uv + n * (u_shimmer * 3.0 / u_res);
      shimmerColor = sampleOver(shimmerUv);
      shimmerAlpha = band * u_shimmer * mix(0.4, 1.0, heatFactor);
    }
  }

  // Composite shimmer, then flame, then sparks, each "over" the last.
  vec3 outColor = shimmerColor;
  float outAlpha = shimmerAlpha;
  outColor = mix(outColor, flameColor, flameAlpha);
  outAlpha = flameAlpha + outAlpha * (1.0 - flameAlpha);
  outColor = mix(outColor, sparkColor, sparkAlpha);
  outAlpha = sparkAlpha + outAlpha * (1.0 - sparkAlpha);

  o_color = vec4(outColor, clamp(outAlpha, 0.0, 1.0));
}
`;

type BonfireLayerProps = Required<
  Pick<
    BonfireEdgeProps,
    | "height"
    | "intensity"
    | "speed"
    | "sparks"
    | "shimmer"
    | "wind"
    | "heat"
    | "edge"
  >
> & { color: string };

/** Walks up from the host to the first opaque background colour, so a
 * shimmer sample over a transparent region composites onto the page rather
 * than onto black — the same probe crystal-lens and dust-reveal use for
 * their own backdrops. */
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
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring and the frame loop; reads everything else from the surface.
 */
function BonfireLayer({
  height,
  intensity,
  speed,
  sparks,
  shimmer,
  wind,
  heat,
  edge,
  color,
}: BonfireLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const pointerX = useMotionValue<number>(OFFSCREEN);
  const pointerVelocity = useVelocity(pointerX);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([
    0.95, 0.55, 0.2, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    height,
    intensity,
    speed,
    sparks,
    shimmer,
    wind,
    heat,
    edge,
  });
  React.useEffect(() => {
    paramsRef.current = {
      height,
      intensity,
      speed,
      sparks,
      shimmer,
      wind,
      heat,
      edge,
    };
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
    const still = !live.motionSafe;
    const windShift = still
      ? 0
      : clamp(
          p.wind * pointerVelocity.get() * WIND_SCALE,
          -WIND_CLAMP,
          WIND_CLAMP,
        );

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_time: tickRef.current,
      u_speed: p.speed,
      u_height: Math.max(p.height, 1),
      u_intensity: p.intensity,
      u_color: colorRef.current.slice(0, 3),
      u_sparks: p.sparks,
      u_shimmer: p.shimmer,
      u_windShift: windShift,
      u_heat: Math.max(p.heat * HEAT_RADIUS_BASE, 1),
      u_pointerX: pointerX.get(),
      u_edgeTop: p.edge === "top" ? 1 : 0,
      u_still: still ? 1 : 0,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [pointerX, pointerVelocity]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect would run against no canvas at all.
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
    // pointer move or idle tick.
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

  // Every pointer-motion change and every completed paint asks for a frame
  // — this alone covers a reduced-motion redraw, since the idle loop below
  // never starts in that case.
  React.useEffect(() => {
    const unsubs = [pointerX, pointerVelocity].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [pointerX, pointerVelocity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the flame colour against the host's own theme whenever either
  // the colour prop or the host changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // The idle loop: continuous while visible, mirroring dust-reveal's rAF
  // shape and gated the same way (IntersectionObserver + visibilitychange,
  // only while the surface is active) — but never started at all under
  // reduced motion, which instead gets the one frame requested above.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    if (!surface.motionSafe) {
      requestFrame();
      return;
    }

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
        // Rebase the clock over the pause so the rise resumes, not jumps.
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
  }, [
    surface.active,
    surface.host,
    surface.motionSafe,
    drawFrame,
    requestFrame,
  ]);

  // Pointer on the host: track x along the edge, springing toward it so
  // wind reads from a smoothed velocity rather than raw pointer jitter.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      if (still) pointerX.set(x);
      else animate(pointerX, x, springs.snap);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX.jump(event.clientX - rect.left);
    };
    const leave = () => {
      if (still) pointerX.set(OFFSCREEN);
      else animate(pointerX, OFFSCREEN, springs.glide);
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
  }, [surface.host, pointerX]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="bonfire-edge"
      className="block h-full w-full"
    />
  );
}

/**
 * Fire along one edge of the interface: flames rise and lick from a noise
 * field, sparks climb from forty-eight seeded column slots and fade with
 * age, and a heat shimmer above the flames re-samples the page through a
 * wavering offset. Move the pointer along the edge and the flames lean
 * downwind of it and grow taller within reach of its heat. The shader draws
 * only the fire and the shimmer — everywhere else in the overlay is fully
 * transparent, so the real DOM underneath shows through untouched.
 * Reduced motion: one still frame at t = 0, sparks frozen at their seeded
 * birth position and the shimmer switched off entirely.
 */
export function BonfireEdge({
  height = 140,
  intensity = 1,
  speed = 1,
  color = "var(--warn)",
  sparks = 1,
  shimmer = 1,
  wind = 0.5,
  heat = 1,
  edge = "bottom",
  paint,
  className,
  children,
}: BonfireEdgeProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <BonfireLayer
          height={height}
          intensity={intensity}
          speed={speed}
          color={color}
          sparks={sparks}
          shimmer={shimmer}
          wind={wind}
          heat={heat}
          edge={edge}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
