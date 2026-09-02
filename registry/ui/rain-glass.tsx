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

export type RainGlassProps = {
  /** How many static beads fill the grid, 0..1 — lower leaves more cells empty. @default 1 */
  density?: number;
  /** Grid scale; a droplet cell is roughly `size * 40` CSS pixels. @default 1 */
  size?: number;
  /** Fall speed of the running drops. @default 1 */
  speed?: number;
  /** How far a droplet bends the view under it, in CSS pixels. @default 30 */
  refraction?: number;
  /** Box-blur strength over the view outside droplets. @default 0.35 */
  blur?: number;
  /** How far the view outside droplets hazes toward a cool grey, 0..1. @default 0.15 */
  fog?: number;
  /** Radius of the cursor's clear patch, in CSS pixels. @default 90 */
  wipeRadius?: number;
  /** Seconds for a wiped patch to fog back over. @default 6 */
  refog?: number;
  /** Whether running drops leave a fading trail of beads behind them. @default true */
  trails?: boolean;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// uniform vec3 u_wipe[WIPE_MAX] — keep in lockstep with the shader's array
// size below. The ref array is capped at the same size: a plain FIFO of
// the most recent host-relative pointer positions.
const WIPE_MAX = 32;
// "push on pointermove when moved ≥ 6px" — CSS pixels.
const WIPE_MIN_MOVE = 6;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_cell;
uniform float u_density;
uniform float u_speed;
uniform float u_refraction;
uniform float u_blur;
uniform float u_fog;
uniform float u_wipeRadius;
uniform float u_refog;
uniform float u_trails;
uniform vec4 u_bg;
uniform vec3 u_wipe[${WIPE_MAX}];
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

const int WIPE_MAX = ${WIPE_MAX};
const int TRAIL_COUNT = 3;
// A running drop's cell is taller than it is wide, so it has room to fall
// before the next pass begins; FALL_PX is its speed in px/sec at speed=1.
const float RUN_HEIGHT_FACTOR = 3.2;
const float FALL_PX = 90.0;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A cheap 3x3 box blur, 9 taps — skipped entirely once the wipe has faded
// amount to (near) zero.
vec3 boxBlur(vec2 uv, float amount) {
  if (amount <= 0.001) return sampleOver(uv);
  vec2 step = (amount * 3.0) / u_res;
  vec3 sum = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      sum += sampleOver(uv + vec2(float(x), float(y)) * step);
    }
  }
  return sum / 9.0;
}

// Coverage + refracted colour for one droplet: p is the current pixel in
// the same linear space as centre c, both in CSS px. The shape is a
// sphere cap, so its surface normal comes straight from the (p-c)/r offset;
// a droplet lenses the view a little inverted, hence the negative scale.
vec4 droplet(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  float dist = length(d);
  float coverage = 1.0 - smoothstep(r - 1.0, r + 1.0, dist);
  if (coverage <= 0.001) return vec4(0.0);
  vec2 nxy = d / max(r, 0.001);
  vec2 offset = -nxy * u_refraction;
  vec3 col = sampleOver(v_uv + offset / u_res);

  vec2 lightDir = normalize(vec2(-0.6, -0.8));
  vec2 dirN = dist > 0.0001 ? d / dist : vec2(0.0);
  float t = clamp(dist / max(r, 0.001), 0.0, 1.0);
  float glint = pow(max(dot(dirN, lightDir), 0.0), 14.0)
    * smoothstep(0.35, 0.95, t) * 0.35;
  col += glint;
  // A drop is not a white disc: its rim darkens as the surface turns
  // away, and it sits a shade cooler than the pane behind it.
  col *= mix(1.0, 0.7, smoothstep(0.5, 1.0, t));
  col = mix(col, vec3(0.62, 0.68, 0.78), 0.08);
  return vec4(col, coverage);
}

void main() {
  vec2 px = v_uv * u_res;

  // WIPE — the closest recent pointer point wins; age fades it back to fog.
  float clear = 0.0;
  for (int i = 0; i < WIPE_MAX; i++) {
    vec3 w = u_wipe[i];
    float dist = length(px - w.xy);
    float spatial = smoothstep(u_wipeRadius, u_wipeRadius * 0.4, dist);
    float age = clamp(1.0 - w.z / max(u_refog, 0.001), 0.0, 1.0);
    clear = max(clear, spatial * age);
  }
  float keep = 1.0 - clear;

  // Background: blurred and hazed everywhere the wipe hasn't reached.
  vec3 blurred = boxBlur(v_uv, u_blur * keep);
  vec3 fogColor = vec3(0.78, 0.81, 0.85);
  vec3 color = mix(blurred, fogColor, u_fog * keep);

  // (a) STATIC beads — one seeded droplet per grid cell, some cells empty.
  vec2 cellId = floor(px / u_cell);
  vec2 cellLocal = px - cellId * u_cell;
  float presence = kx_hash(cellId + 4.7);
  if (presence > 1.0 - clamp(u_density, 0.0, 1.0)) {
    vec2 off = vec2(
      kx_hash(cellId + vec2(13.1, 3.7)),
      kx_hash(cellId + vec2(51.9, 71.3))
    ) - 0.5;
    vec2 c = u_cell * 0.5 + off * u_cell * 0.7;
    float r = mix(u_cell * 0.10, u_cell * 0.22, kx_hash(cellId + vec2(91.3, 17.1)));
    vec4 bead = droplet(cellLocal, c, r);
    color = mix(color, bead.rgb, bead.a * keep);
  }

  // (b) RUNNING drops — a taller grid that scrolls with u_tick * speed.
  // Adding the column's own phase before flooring staggers columns so they
  // don't all fall in lockstep.
  float runCell = u_cell * RUN_HEIGHT_FACTOR;
  float col = floor(px.x / u_cell);
  float colPhase = kx_hash(vec2(col, 9.3));
  float travel = px.y - u_tick * u_speed * FALL_PX + colPhase * runCell;
  float row = floor(travel / runCell);
  vec2 cellIdRun = vec2(col, row);
  vec2 localRun = vec2(px.x - col * u_cell, travel - row * runCell);

  float rRun = mix(u_cell * 0.14, u_cell * 0.3, kx_hash(cellIdRun + vec2(41.7, 7.3)));
  float wobblePhase = kx_hash(cellIdRun + vec2(71.1, 5.9)) * 6.2831853;
  float wobble = sin(travel * 0.035 + wobblePhase) * u_cell * 0.12;
  vec2 centerRun = vec2(u_cell * 0.5 + wobble, runCell * 0.5);

  vec4 drop = droplet(localRun, centerRun, rRun);
  color = mix(color, drop.rgb, drop.a * keep);

  if (u_trails > 0.5) {
    for (int k = 1; k <= TRAIL_COUNT; k++) {
      float fk = float(k);
      vec2 tc = vec2(centerRun.x, centerRun.y - fk * rRun * 1.7);
      float tr = rRun * mix(0.55, 0.18, fk / float(TRAIL_COUNT));
      float alpha = mix(0.55, 0.05, fk / float(TRAIL_COUNT));
      vec4 bead = droplet(localRun, tc, tr);
      color = mix(color, bead.rgb, bead.a * alpha * keep);
    }
  }

  o_color = vec4(color, 1.0);
}
`;

type RainGlassLayerProps = Required<
  Pick<
    RainGlassProps,
    | "density"
    | "size"
    | "speed"
    | "refraction"
    | "blur"
    | "fog"
    | "wipeRadius"
    | "refog"
    | "trails"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent region composites onto the page rather
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

type WipePoint = { x: number; y: number; t: number };

/**
 * The GL layer. Owns the context, the program, the texture, the wipe-point
 * history and the frame loop; reads everything else from the surface.
 */
function RainGlassLayer({
  density,
  size,
  speed,
  refraction,
  blur,
  fog,
  wipeRadius,
  refog,
  trails,
  background,
}: RainGlassLayerProps) {
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
  const failedRef = React.useRef(false);
  const wipeRef = React.useRef<WipePoint[]>([]);
  const wipeDataRef = React.useRef(new Float32Array(WIPE_MAX * 3));

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    density,
    size,
    speed,
    refraction,
    blur,
    fog,
    wipeRadius,
    refog,
    trails,
  });
  React.useEffect(() => {
    paramsRef.current = {
      density,
      size,
      speed,
      refraction,
      blur,
      fog,
      wipeRadius,
      refog,
      trails,
    };
  });

  // One frame: upload the texture if a new paint landed, refresh the wipe
  // history, then draw.
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
      u_cell: p.size * 40,
      u_density: p.density,
      u_speed: p.speed,
      u_refraction: p.refraction,
      u_blur: p.blur,
      u_fog: p.fog,
      u_wipeRadius: p.wipeRadius,
      u_refog: p.refog,
      u_trails: p.trails ? 1 : 0,
      u_bg: bg,
    });

    // u_wipe is a vec3[32] — too long for Program.set's fixed-arity switch,
    // so it's uploaded directly, the same way ascii-lens uploads its glyph
    // atlas array.
    const wipeData = wipeDataRef.current;
    const points = wipeRef.current;
    for (let i = 0; i < WIPE_MAX; i += 1) {
      const point = points[i];
      const base = i * 3;
      if (point) {
        wipeData[base] = point.x;
        wipeData[base + 1] = point.y;
        wipeData[base + 2] = tickRef.current - point.t;
      } else {
        wipeData[base] = -9999;
        wipeData[base + 1] = -9999;
        wipeData[base + 2] = p.refog + 1;
      }
    }
    const wipeLocation = program.uniforms.u_wipe;
    if (wipeLocation) {
      gl.useProgram(program.program);
      gl.uniform3fv(wipeLocation, wipeData);
    }

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

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The continuous loop: rain never stops on its own, so `u_tick` advances
  // every frame the host is actually visible. Gated by IntersectionObserver
  // and page visibility, same as the GL effect, only while `surface.active`.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

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
        // Rebase the clock over the pause so the rain resumes, not jumps.
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
  }, [surface.active, surface.host, drawFrame]);

  // Pointer on the host: record host-relative positions for the wipe, at
  // most every 6px of movement, capped at the last 32.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const points = wipeRef.current;
      const last = points[points.length - 1];
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        if (dx * dx + dy * dy < WIPE_MIN_MOVE * WIPE_MIN_MOVE) return;
      }
      points.push({ x, y, t: tickRef.current });
      if (points.length > WIPE_MAX) points.shift();
      requestFrame();
    };

    host.addEventListener("pointermove", move);
    return () => {
      host.removeEventListener("pointermove", move);
    };
  }, [surface.host, background, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="rain-glass"
      className="block h-full w-full"
    />
  );
}

/**
 * Rain beading on the glass over the live interface: static droplets sit
 * fixed in their cells, each seeded from its own cell id so the pane always
 * rains the same way, while a second, taller grid of running drops slides
 * down on its own clock, wobbling in x and trailing a fading string of
 * beads behind it. Every droplet bends the texture beneath it through a
 * sphere-cap normal — a small, slightly inverted refraction, crisp against
 * the rest of the pane, which sits blurred and hazed toward a cool grey
 * like fogged breath on a window. Move the cursor and it wipes a clear
 * patch through the fog and droplets alike, which mists back over once the
 * cursor moves on. Nothing here is random — cell hashes and the tick clock
 * are the only inputs — so a given size, density and moment always paints
 * the same rain.
 * Reduced motion: the real DOM shows in full and this layer renders
 * nothing.
 */
export function RainGlass({
  density = 1,
  size = 1,
  speed = 1,
  refraction = 30,
  blur = 0.35,
  fog = 0.15,
  wipeRadius = 90,
  refog = 6,
  trails = true,
  background,
  paint,
  className,
  children,
}: RainGlassProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <RainGlassLayer
          density={density}
          size={size}
          speed={speed}
          refraction={refraction}
          blur={blur}
          fog={fog}
          wipeRadius={wipeRadius}
          refog={refog}
          trails={trails}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
