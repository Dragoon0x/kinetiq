"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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

export type BrailleLensProps = {
  /** Lens radius in CSS pixels. @default 180 */
  radius?: number;
  /** Feather width at the lens edge — 0 is a hard circle. @default 0.5 */
  softness?: number;
  /** Braille cell size in CSS pixels; each cell holds a fixed 2x3 dot lattice. @default 14 */
  cell?: number;
  /** Dot dome radius in CSS pixels. @default 2.4 */
  dot?: number;
  /** Ambient-occlusion strength at each dot's base. @default 1 */
  relief?: number;
  /** The embossed paper colour, resolved with `resolveColor` scoped to the host. @default "var(--color-surface-0)" */
  paper?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_cell;
uniform float u_dot;
uniform float u_relief;
uniform vec4 u_paper;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

vec3 bl_sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float feather = max(u_softness, 0.0) * 40.0 + 1.0;
  float edge = 1.0 - smoothstep(R - feather, R + feather, r);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }
  float t = clamp(r / R, 0.0, 1.0);
  // A thin bezel ring just inside the rim.
  float ring = smoothstep(0.90, 0.975, t) * (1.0 - smoothstep(0.975, 1.0, t));

  if (u_still > 0.5) {
    // Reduced motion: no embossing, only a still outline so the lens is
    // legible as a shape without raising anything under it.
    o_color = vec4(vec3(1.0), ring * 0.55 * u_opacity * edge);
    return;
  }

  // Locate this fragment's braille cell (a fixed 2 column x 3 row dot
  // lattice per cell, pinned to the page) and the nearest dot centre
  // within it.
  float cellSize = max(u_cell, 2.0);
  vec2 cell = floor(px / cellSize);
  vec2 cellOrigin = cell * cellSize;
  vec2 local = px - cellOrigin;
  vec2 dotSpan = vec2(cellSize * 0.5, cellSize / 3.0);
  vec2 dotIndex = clamp(floor(local / dotSpan), vec2(0.0), vec2(1.0, 2.0));
  vec2 dotCenter = cellOrigin + (dotIndex + 0.5) * dotSpan;

  vec3 src = bl_sampleOver(dotCenter / u_res);
  float coverage = clamp(1.0 - kx_luma(src), 0.0, 1.0);

  vec3 color = u_paper.rgb;

  float dotR = max(u_dot, 0.5);
  float dr = length(px - dotCenter);
  if (coverage >= 0.15 && dr <= dotR) {
    // A dome of radius u_dot: the normal comes from the radial position,
    // squashed toward flat as coverage (the dot's height) drops.
    float rt = clamp(dr / dotR, 0.0, 1.0);
    vec2 dir = dr > 0.001 ? (px - dotCenter) / dr : vec2(0.0);
    float z = sqrt(max(0.0, 1.0 - rt * rt));
    vec3 normal = normalize(mix(vec3(0.0, 0.0, 1.0), vec3(dir * rt, z), coverage));

    vec3 light = normalize(vec3(-0.55, -0.65, 0.6));
    float diffuse = max(dot(normal, light), 0.0);
    vec3 halfVec = normalize(light + vec3(0.0, 0.0, 1.0));
    float highlight = pow(max(dot(normal, halfVec), 0.0), 28.0);

    // Ambient occlusion ring at the dot's base, scaled by relief.
    float ao = smoothstep(0.62, 1.0, rt) * clamp(u_relief, 0.0, 2.0) * 0.4;

    color = u_paper.rgb * (0.5 + diffuse * 0.65);
    color *= (1.0 - ao);
    color += highlight * 0.45 * coverage;
  }

  color *= (1.0 - ring * 0.10);

  o_color = vec4(color, u_opacity * edge);
}
`;

type LensLayerProps = Required<
  Pick<
    BrailleLensProps,
    "radius" | "softness" | "cell" | "dot" | "relief" | "paper"
  >
>;

/** Walks up from the host to the first opaque background colour, so a
 * texture sample over a transparent region composites onto the page rather
 * than onto black. */
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
 * spring, and the frame loop; reads everything else from the surface.
 */
function LensLayer({
  radius,
  softness,
  cell,
  dot,
  relief,
  paper,
}: LensLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const paperRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, cell, dot, relief });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, cell, dot, relief };
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_cell: p.cell,
      u_dot: p.dot,
      u_relief: p.relief,
      u_paper: paperRef.current,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, opacity]);

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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, opacity].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The paper colour resolves from the host's own subtree, so a scoped
  // theme override is honoured; re-resolve whenever the theme flips.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const resolve = () => {
      paperRef.current = resolveColor(paper, host);
      requestFrame();
    };
    resolve();
    if (typeof MutationObserver === "undefined") return;
    const themeObserver = new MutationObserver(resolve);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => themeObserver.disconnect();
  }, [paper, surface.host, requestFrame]);

  // Pointer on the host: spring the lens toward the cursor, fade in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
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
    };
  }, [surface.host, x, y, opacity]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="braille-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A lens that follows the cursor and embosses the interface underneath into
 * braille: each cell it covers samples the painted texture at six fixed dot
 * positions, and any dot whose ink coverage (one minus luma) clears 0.15
 * rises as a shaded dome — a radial normal, diffuse light from the upper
 * left, a small highlight, and an ambient-occlusion ring at its base. Dots
 * that fall short of that threshold stay flat paper, so sparse text reads
 * as sparse dots rather than a filled grid. The lattice is pinned to the
 * page; only the lens travels, and nothing outside its rim is touched.
 * Reduced motion: a still lens outline follows the pointer without
 * springing, and nothing underneath is embossed.
 */
export function BrailleLens({
  radius = 180,
  softness = 0.5,
  cell = 14,
  dot = 2.4,
  relief = 1,
  paper = "var(--color-surface-0)",
  paint,
  className,
  children,
}: BrailleLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          cell={cell}
          dot={dot}
          relief={relief}
          paper={paper}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
