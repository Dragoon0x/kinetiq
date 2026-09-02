"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
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

export type DropletCursorProps = {
  /** Drops in the chain. @default 12 */
  count?: number;
  /** Lead drop radius in CSS pixels. @default 42 */
  size?: number;
  /** Radius shrink per drop down the chain (0..1). @default 0.85 */
  taper?: number;
  /** How hard each drop chases the one ahead, per frame (0..1). @default 0.35 */
  follow?: number;
  /** How hard the surface bends the image beneath it (0..1). @default 0.5 */
  refraction?: number;
  /** Colour-fringe strength at the rim (0..1). @default 0.2 */
  dispersion?: number;
  /** Rim tint colour. @default "var(--primary)" */
  color?: string;
  /** Rim tint strength (0..1). @default 0.12 */
  tint?: number;
  /** Specular highlight strength (0..1). @default 0.7 */
  highlight?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** Uniform array length — also the hard cap on `count`. */
const MAX_DROPS = 16;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_drops[${MAX_DROPS}];
uniform int u_count;
uniform float u_refraction;
uniform float u_dispersion;
uniform vec3 u_color;
uniform float u_tint;
uniform float u_highlight;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Each drop contributes r^2 / max(d^2, 1) at a point; two drops whose
// fields overlap just add here — merging is what this sum does, never a
// special case handled after the fact.
float field(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= u_count) break;
    vec3 drop = u_drops[i];
    float d2 = dot(p - drop.xy, p - drop.xy);
    f += (drop.z * drop.z) / max(d2, 1.0);
  }
  return f;
}

void main() {
  vec2 px = v_uv * u_res;
  float f = field(px);
  // A hair crisper under reduced motion so the shape stays legible even
  // though nothing is chasing the pointer.
  float edgeHalf = mix(0.125, 0.07, u_still);
  float edge = smoothstep(1.0 - edgeHalf, 1.0 + edgeHalf, f);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }

  // Surface normal from the field gradient, central differences over 2px.
  float fx = (field(px + vec2(2.0, 0.0)) - field(px - vec2(2.0, 0.0))) / 4.0;
  float fy = (field(px + vec2(0.0, 2.0)) - field(px - vec2(0.0, 2.0))) / 4.0;
  vec3 n = normalize(vec3(vec2(-fx, -fy) * u_refraction, 1.0));

  vec2 uv = px / u_res;
  vec2 src = uv - n.xy * u_refraction * 24.0 / u_res;
  vec2 dir = length(n.xy) > 0.0001 ? normalize(n.xy) : vec2(0.0);
  float dispPx = u_dispersion * 6.0;
  vec3 c = vec3(
    sampleOver(src + dir * dispPx / u_res).r,
    sampleOver(src).g,
    sampleOver(src - dir * dispPx / u_res).b
  );

  // A soft inner shadow along the lower rim, where the normal tips down.
  float shadow = smoothstep(0.05, 0.6, n.y) * 0.22;
  c *= (1.0 - shadow);

  // Specular highlight from a fixed upper-left light.
  vec3 light = normalize(vec3(-0.45, -0.65, 0.6));
  c += u_highlight * pow(max(dot(n, light), 0.0), 32.0);

  // Fresnel rim, tinted by the caller's colour.
  float fresnel = pow(clamp(1.0 - n.z, 0.0, 1.0), 3.0);
  c += u_color * u_tint * fresnel;

  o_color = vec4(c, u_opacity * edge);
}
`;

type DropletLayerProps = Required<
  Pick<
    DropletCursorProps,
    | "count"
    | "size"
    | "taper"
    | "follow"
    | "refraction"
    | "dispersion"
    | "color"
    | "tint"
    | "highlight"
  >
>;

const clampCount = (n: number): number =>
  Math.min(MAX_DROPS, Math.max(1, Math.round(n)));

/** Walks up from the host to the first opaque background colour, so page
 * samples over transparent texture regions composite onto the real page
 * rather than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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
 * The GL layer. Owns the context, the program, the texture, the drop chain,
 * and the frame loop; reads everything else from the surface.
 */
function DropletLayer({
  count,
  size,
  taper,
  follow,
  refraction,
  dispersion,
  color,
  tint,
  highlight,
}: DropletLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const opacity = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRgbRef = React.useRef<[number, number, number]>([0, 0, 0]);
  const failedRef = React.useRef(false);

  // The chain: positions in CSS px (x, y per drop), MAX_DROPS deep so
  // `count` can change without reallocating. Radii are derived at draw
  // time from `size`/`taper` — they never need to be stored.
  const positionsRef = React.useRef(new Float32Array(MAX_DROPS * 2));
  const uniformDropsRef = React.useRef(new Float32Array(MAX_DROPS * 3));

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    count: clampCount(count),
    size,
    taper,
    follow,
    refraction,
    dispersion,
    tint,
    highlight,
  });
  React.useEffect(() => {
    paramsRef.current = {
      count: clampCount(count),
      size,
      taper,
      follow,
      refraction,
      dispersion,
      tint,
      highlight,
    };
  });

  // One frame: upload the texture if a new paint landed, rebuild the drop
  // uniform from the chain's current positions, then draw.
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

    const size2 = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size2.width / size2.dpr;
    const cssH = size2.height / size2.dpr;
    const p = paramsRef.current;
    // Reduced motion collapses the chain to a single, already-snapped drop.
    const activeCount = live.motionSafe ? p.count : 1;

    const positions = positionsRef.current;
    const uniformDrops = uniformDropsRef.current;
    let radius = p.size;
    for (let i = 0; i < activeCount; i += 1) {
      uniformDrops[i * 3] = positions[i * 2] ?? 0;
      uniformDrops[i * 3 + 1] = positions[i * 2 + 1] ?? 0;
      uniformDrops[i * 3 + 2] = radius;
      radius *= p.taper;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    // `u_drops` is a vec3[16] — too large for Program.set's fixed-arity
    // dispatch, so it's uploaded directly, the same way ascii-lens uploads
    // its glyph atlas uniform.
    const dropsLoc = program.uniforms.u_drops;
    if (dropsLoc) {
      gl.useProgram(program.program);
      gl.uniform3fv(dropsLoc, uniformDrops);
    }
    program.set({
      u_res: [cssW, cssH],
      u_count: new Int32Array([activeCount]),
      u_refraction: p.refraction,
      u_dispersion: p.dispersion,
      u_color: colorRgbRef.current,
      u_tint: p.tint,
      u_highlight: p.highlight,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [opacity]);

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
    // pointer move.
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

  // Opacity drives visibility only — the chain's own positions live outside
  // React state, so this is the one motion value that needs a frame on change.
  React.useEffect(() => {
    const unsub = opacity.on("change", requestFrame);
    return unsub;
  }, [opacity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the rim tint through the real cascade — `color` may be a design
  // token like `var(--primary)`, which only resolves against the host's
  // own subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const [r, g, b] = resolveColor(color, host);
    colorRgbRef.current = [r, g, b];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: drive the chain and fade the drops in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const positions = positionsRef.current;
    const still = !surfaceRef.current.motionSafe;
    let pointerX = 0;
    let pointerY = 0;
    let raf = 0;

    // Drop 0 chases the pointer; every drop behind chases the drop ahead of
    // it, already moved this frame. Runs until every drop has settled
    // within 0.2px of its target.
    const stepChain = (): boolean => {
      const p = paramsRef.current;
      let unsettled = false;
      let targetX = pointerX;
      let targetY = pointerY;
      for (let i = 0; i < p.count; i += 1) {
        const px = positions[i * 2] ?? 0;
        const py = positions[i * 2 + 1] ?? 0;
        const dx = targetX - px;
        const dy = targetY - py;
        if (Math.hypot(dx, dy) > 0.2) {
          positions[i * 2] = px + dx * p.follow;
          positions[i * 2 + 1] = py + dy * p.follow;
          unsettled = true;
        } else {
          positions[i * 2] = targetX;
          positions[i * 2 + 1] = targetY;
        }
        targetX = positions[i * 2] ?? targetX;
        targetY = positions[i * 2 + 1] ?? targetY;
      }
      return unsettled;
    };

    const tick = () => {
      raf = 0;
      const unsettled = stepChain();
      requestFrame();
      if (unsettled) raf = requestAnimationFrame(tick);
    };
    const ensureRunning = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      if (still) {
        // Reduced motion: drop 0 snaps, no chain, no loop.
        positions[0] = pointerX;
        positions[1] = pointerY;
        requestFrame();
      } else {
        ensureRunning();
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      // The whole chain snaps to the entry point — no sweep-in from
      // wherever it last settled, the same instant jump crystal-lens does
      // on pointerenter.
      for (let i = 0; i < MAX_DROPS; i += 1) {
        positions[i * 2] = pointerX;
        positions[i * 2 + 1] = pointerY;
      }
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
      requestFrame();
    };
    const leave = () => {
      if (still) opacity.set(0);
      else animate(opacity, 0, { duration: 0.22 });
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
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [surface.host, opacity, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="droplet-cursor"
      className="block h-full w-full"
    />
  );
}

/**
 * A chain of drops trails the cursor and refracts the interface beneath it:
 * drop 0 chases the pointer, and each drop behind chases the one ahead of
 * it, shrinking down the chain by `taper`. Where two drops overlap, their
 * fields simply add and read as one liquid surface — merging is what the
 * sum does, never a special case bolted on afterward — and light bends
 * through the merged shape, catches a highlight on its upper-left shoulder,
 * and tints the rim with `color`. Like crystal-lens it draws only where the
 * drops are, leaving the rest of the canvas at zero alpha so the real DOM
 * beneath stays clickable and focusable.
 * Reduced motion: the chain collapses to a single drop that snaps straight
 * to the pointer, with no chase and no trail, and still refracts the
 * interface beneath it.
 */
export function DropletCursor({
  count = 12,
  size = 42,
  taper = 0.85,
  follow = 0.35,
  refraction = 0.5,
  dispersion = 0.2,
  color = "var(--primary)",
  tint = 0.12,
  highlight = 0.7,
  paint,
  className,
  children,
}: DropletCursorProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <DropletLayer
          count={count}
          size={size}
          taper={taper}
          follow={follow}
          refraction={refraction}
          dispersion={dispersion}
          color={color}
          tint={tint}
          highlight={highlight}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
